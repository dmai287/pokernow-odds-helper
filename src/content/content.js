// content.js — ties scraper + overlay + equity engine together and keeps them in
// sync with the live table via a debounced MutationObserver.
(function () {
  const PNO = window.PNO;
  if (!PNO || !PNO.overlay) return;

  const DEFAULTS = { enabled: true, autoDetect: true, iterations: 2000 };
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

    if (settings.autoDetect) {
      const scraped = PNO.scraper.scrape();
      if (scraped.hero.length === 2) state.hero = scraped.hero;
      if (scraped.board.length) state.board = scraped.board;
      overlay.setCards(state.hero, state.board);
    }

    if (state.hero.length !== 2) {
      overlay.showResult(null, null);
      return;
    }

    const res = PNO.equity.monteCarlo(state.hero, state.board, state.opponents, settings.iterations);
    const breakeven = PNO.equity.potOdds(state.pot, state.call);
    overlay.showResult(res, breakeven);
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
