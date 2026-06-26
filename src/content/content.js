// content.js — ties scraper + overlay + equity engine together and keeps them in
// sync with the live table via a debounced MutationObserver.
(function () {
  const PNO = window.PNO;
  if (!PNO || !PNO.overlay) return;

  const DEFAULTS = {
    enabled: true, autoDetect: true, iterations: 2000, villainRange: 100, autoRange: true,
  };
  let settings = Object.assign({}, DEFAULTS);
  let overlay = null;

  // Hand-history tracking: pendingHand holds the latest snapshot of the hand in
  // progress. It is committed to history when the hand ends — detected either by the
  // hole cards clearing, or by a new hand being dealt (different hole cards). The
  // latter is the reliable signal: tables often replace cards with no settled gap.
  let pendingHand = null;
  let pendingHeroKey = null;
  let handStartStack = null;

  function commitHand(endStack) {
    if (!pendingHand) return;
    if (typeof endStack === 'number') pendingHand.endStack = endStack;
    pendingHand.net = (typeof handStartStack === 'number' && typeof pendingHand.endStack === 'number')
      ? pendingHand.endStack - handStartStack : null;
    PNO.history.add(pendingHand);
    pendingHand = null;
    pendingHeroKey = null;
    handStartStack = null;
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function recompute() {
    if (!overlay) return;
    const state = overlay.getInputs();
    let position = null;
    let heroStack = null;

    let bb = null;
    if (settings.autoDetect) {
      const scraped = PNO.scraper.scrape();
      heroStack = scraped.heroStack;
      bb = scraped.bb;
      // Mirror the live table exactly, including empties. When a hand ends and the
      // board / hole cards clear, this resets the displayed cards and odds instead of
      // leaving the previous hand's numbers on screen.
      state.hero = scraped.hero;
      state.board = scraped.board;
      overlay.setCards(state.hero, state.board);

      state.opponents = scraped.opponents > 0 ? scraped.opponents : state.opponents;
      if (scraped.pot != null) state.pot = scraped.pot;
      if (scraped.call != null) state.call = scraped.call;
      overlay.setMeta(
        scraped.opponents > 0 ? scraped.opponents : null,
        scraped.pot,
        scraped.call
      );
      position = scraped.position;
    }
    overlay.setPosition(position);

    if (state.hero.length !== 2) {
      // Hand over (cards cleared): commit the last snapshot.
      if (settings.autoDetect) commitHand(heroStack);

      overlay.setDraws(null);
      overlay.setEV(null);
      overlay.showResult(null, PNO.decision.decide({ equity: null }));
      return;
    }

    overlay.setDraws(PNO.draws.analyze(state.hero, state.board));

    const pct = settings.autoRange
      ? PNO.ranges.tightnessFromAction(state.pot, state.call, state.board.length)
      : Math.max(5, Math.min(100, settings.villainRange || 100)) / 100;
    const villainRange = pct >= 1 ? null : PNO.ranges.topPercent(pct);
    const res = PNO.equity.monteCarlo(
      state.hero, state.board, state.opponents, settings.iterations, villainRange
    );
    // Preflop, prefer position-based starting-hand advice; postflop use equity/pot odds.
    const preflopAdvice = (state.board.length === 0)
      ? PNO.preflop.advise({
          hole: state.hero,
          position: position ? position.name : null,
          inPosition: position ? position.inPosition : undefined,
          call: state.call,
          bb,
        })
      : null;

    const decision = preflopAdvice
      ? preflopAdvice
      : res
        ? PNO.decision.decide({
            equity: res.equity,
            pot: state.pot,
            call: state.call,
            opponents: state.opponents,
            inPosition: position ? position.inPosition : undefined,
          })
        : { action: '—', tone: 'bad', reason: 'Duplicate card detected — check your inputs.' };
    const rangeLabel = villainRange
      ? `top ${Math.round(pct * 100)}%${settings.autoRange ? ' (auto)' : ''}`
      : 'any two';
    overlay.showResult(res, decision, rangeLabel);

    // Expected value of calling — only meaningful when there's a bet to call.
    const ev = (res && state.call > 0)
      ? PNO.equity.callEV(res.equity, state.pot, state.call) : null;
    if (ev != null) overlay.setEV({ ev, win: state.pot });
    else overlay.setEV(null);

    // Update the hand-in-progress snapshot (committed to history when the hand ends).
    if (settings.autoDetect) {
      const heroKey = state.hero.map(PNO.cards.cardToStr).join('');
      // New hand dealt (different hole cards): commit the previous one. The current
      // stack already reflects that hand's result, so it serves as the end stack.
      if (pendingHand && pendingHeroKey !== heroKey) commitHand(heroStack);
      if (pendingHand === null) handStartStack = heroStack; // first tick of a new hand
      pendingHeroKey = heroKey;
      pendingHand = {
        t: Date.now(),
        hero: state.hero.map(PNO.cards.cardToStr),
        board: state.board.map(PNO.cards.cardToStr),
        street: PNO.history.streetName(state.board.length),
        position: position ? position.name : null,
        inPosition: position ? position.inPosition : null,
        opponents: state.opponents,
        pot: state.pot,
        call: state.call,
        equity: res ? res.equity : null,
        action: decision.action + (decision.size && decision.size.chips > 0 ? ` → ${decision.size.chips}` : ''),
        ev,
        range: rangeLabel,
        endStack: heroStack,
      };
    }
  }

  function start() {
    overlay = PNO.overlay.create();
    overlay.setEnabled(settings.enabled);

    const debounced = debounce(recompute, 350);
    overlay.onChange(debounced);

    const observer = new MutationObserver(debounced);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-card'],
    });

    // React to live settings changes from the popup.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      let touched = false;
      for (const key of Object.keys(DEFAULTS)) {
        if (changes[key]) { settings[key] = changes[key].newValue; touched = true; }
      }
      if (touched) {
        overlay.setEnabled(settings.enabled);
        recompute();
      }
    });

    recompute();
  }

  chrome.storage.local.get(DEFAULTS, (stored) => {
    settings = Object.assign({}, DEFAULTS, stored);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  });
})();
