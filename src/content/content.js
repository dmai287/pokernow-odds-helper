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

    if (settings.autoDetect) {
      const scraped = PNO.scraper.scrape();
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
    const decision = res
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
    if (res && state.call > 0) {
      overlay.setEV({
        ev: PNO.equity.callEV(res.equity, state.pot, state.call),
        win: state.pot, // chips you collect if you win
      });
    } else {
      overlay.setEV(null);
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
