// content.js — ties scraper + overlay + equity engine together and keeps them in
// sync with the live table via a debounced MutationObserver.
(function () {
  const PNO = window.PNO;
  if (!PNO || !PNO.overlay) return;

  const DEFAULTS = {
    enabled: true, autoDetect: true, iterations: 2000, villainRange: 100, autoRange: true,
    onlyMyTurn: true, coaching: true,
  };
  let settings = Object.assign({}, DEFAULTS);
  let overlay = null;
  let observer = null;
  let coachProfile = null;

  // Recompute the player's tendency profile from logged hands.
  function refreshCoach() {
    if (!settings.coaching || !PNO.coach || !PNO.history) { coachProfile = null; return; }
    PNO.history.getAll((hands) => { coachProfile = PNO.coach.profile(hands); });
  }

  // After the extension is reloaded, this orphaned content script keeps running but
  // every chrome.* call throws. Detect that and shut ourselves down cleanly.
  function extAlive() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function shutdown() {
    if (observer) { try { observer.disconnect(); } catch (e) {} observer = null; }
    if (overlay) { try { overlay.setEnabled(false); } catch (e) {} }
  }

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
    refreshCoach(); // learn from the hand just logged
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
    if (!extAlive()) { shutdown(); return; } // orphaned after an extension reload
    const state = overlay.getInputs();
    let position = null;
    let heroStack = null;
    let myTurn = null;

    let bb = null;
    if (settings.autoDetect) {
      const scraped = PNO.scraper.scrape();
      heroStack = scraped.heroStack;
      bb = scraped.bb;
      myTurn = scraped.myTurn;
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

    const drawInfo = PNO.draws.analyze(state.hero, state.board);
    overlay.setDraws(drawInfo);

    // Build the villain range(s). With auto-range and a multiway bet, model the raiser
    // with a tight range and the callers with a wider one (per-villain ranges).
    const autoTight = PNO.ranges.tightnessFromAction(state.pot, state.call, state.board.length);
    let villainRange, rangeLabel;
    if (settings.autoRange) {
      const tightSet = autoTight >= 1 ? null : PNO.ranges.topPercent(autoTight);
      if (state.call > 0 && state.opponents > 1) {
        const callerSet = PNO.ranges.topPercent(0.50);
        villainRange = [tightSet];
        for (let i = 1; i < state.opponents; i++) villainRange.push(callerSet);
        rangeLabel = `raiser top ${Math.round(autoTight * 100)}% · ${state.opponents - 1}× top 50%`;
      } else {
        villainRange = tightSet;
        rangeLabel = tightSet ? `top ${Math.round(autoTight * 100)}% (auto)` : 'any two';
      }
    } else {
      const p = Math.max(5, Math.min(100, settings.villainRange || 100)) / 100;
      villainRange = p >= 1 ? null : PNO.ranges.topPercent(p);
      rangeLabel = villainRange ? `top ${Math.round(p * 100)}%` : 'any two';
    }

    // "What beats you" — weight by the bettor's range when we have one (use the tight
    // aggressor range in multiway), else by the single range / all hands.
    const beatsRange = Array.isArray(villainRange) ? villainRange[0] : villainRange;
    overlay.setBeats(PNO.beats.analyze(state.hero, state.board, beatsRange));

    // Preflop: show the villain's range composition (high vs low) from their action.
    overlay.setComposition(
      state.board.length === 0 ? PNO.composition.analyze(beatsRange, state.hero) : null
    );

    const res = PNO.equity.monteCarlo(
      state.hero, state.board, state.opponents, settings.iterations, villainRange
    );

    // Preflop, prefer position-based starting-hand advice; postflop use equity/pot odds
    // (with implied odds for draws and a stack-behind estimate).
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
            outs: drawInfo ? drawInfo.outs : 0,
            effStack: typeof heroStack === 'number' ? Math.max(0, heroStack - state.call) : 0,
          })
        : { action: '—', tone: 'bad', reason: 'Duplicate card detected — check your inputs.' };

    // Advise only on your turn (when enabled and we can tell it isn't): keep the
    // equity/draws/EV as information but hold the Fold/Call/Raise call.
    const shownDecision = (settings.autoDetect && settings.onlyMyTurn && myTurn === false)
      ? { action: '⏳ Not your turn', tone: 'neutral',
          reason: 'Advice appears when it’s your action.' }
      : decision;
    overlay.showResult(res, shownDecision, rangeLabel);

    // Coaching nudge from the player's own history, relevant to this spot.
    if (settings.coaching && coachProfile && PNO.coach) {
      overlay.setCoach(PNO.coach.note(coachProfile, {
        street: PNO.history.streetName(state.board.length),
        inPosition: position ? position.inPosition : undefined,
        action: decision.action,
        facingBet: state.call > 0,
      }));
    } else {
      overlay.setCoach(null);
    }

    // Opponent profile from logged hands and the current live spot. Only read storage
    // when the module is actually present — avoids a chrome.storage read every tick.
    if (PNO.enemies) {
      PNO.history.getAll((hands) => {
        overlay.setEnemyProfile(PNO.enemies.profile(hands, {
          street: PNO.history.streetName(state.board.length),
          opponents: state.opponents,
          rangeLabel,
          action: decision.action,
        }));
      });
    } else {
      overlay.setEnemyProfile(null);
    }

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
      const sameHand = pendingHand && pendingHeroKey === heroKey;

      // The pot only grows within a hand. Once the hand resolves, the table resets the
      // pot (and call) to 0 while the hole cards are still shown — don't let that empty
      // state overwrite the last live snapshot (this was logging pot/call as 0).
      const resetting = sameHand && state.pot < (pendingHand.pot || 0);
      if (!resetting) {
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
  }

  function start() {
    overlay = PNO.overlay.create();
    overlay.setEnabled(settings.enabled);

    const debounced = debounce(recompute, 350);
    overlay.onChange(debounced);

    observer = new MutationObserver(debounced);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-card'],
    });

    // React to live settings changes from the popup, and to history updates.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      let touched = false;
      for (const key of Object.keys(DEFAULTS)) {
        if (changes[key]) { settings[key] = changes[key].newValue; touched = true; }
      }
      if (changes[PNO.history.KEY]) refreshCoach(); // history cleared/updated elsewhere
      if (touched) {
        overlay.setEnabled(settings.enabled);
        refreshCoach(); // e.g. coaching toggled on
        recompute();
      }
    });

    refreshCoach();
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
