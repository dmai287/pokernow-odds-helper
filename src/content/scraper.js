// scraper.js — best-effort reader of PokerNow's table DOM.
// PokerNow's markup changes over time, so all selectors and parsing strategies are
// centralized here and tried in order. If auto-detect misses, the overlay always
// allows manual card entry. Tune SELECTORS below against the live page if needed.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const { parseCard, dedupe } = PNO.cards;

  const SELECTORS = {
    // Hero's hole cards. ".you-player" is PokerNow's container for the seated user.
    hero: [
      '.you-player .table-player-cards .card',
      '.you-player .card',
      '.table-player.you-player .card',
    ],
    // Community / board cards.
    board: [
      '.table-cards .card',
      '.community-cards .card',
      '.board .card',
    ],
  };

  // Extract a card from a single element using several fallback strategies.
  function readCardEl(el) {
    // 1) explicit data attribute, e.g. data-card="As"
    let txt = el.getAttribute('data-card') || el.getAttribute('data-value') || '';

    // 2) separate rank + suit child nodes
    if (!parseCard(txt)) {
      const v = el.querySelector('.value, .rank, .card-value');
      const s = el.querySelector('.suit, .card-suit');
      if (v && s) txt = (v.textContent || '').trim() + (s.textContent || '').trim();
    }

    // 3) whole-element text content (e.g. "A♠")
    if (!parseCard(txt)) txt = (el.textContent || '').replace(/\s+/g, '');

    // 4) class-name encoding, e.g. class="card card-as" or "card-10h"
    if (!parseCard(txt)) {
      const m = (el.className || '').toString().match(/card[-_ ]([2-9tjqka]{1,2}[shdc])\b/i);
      if (m) txt = m[1];
    }

    return parseCard(txt);
  }

  function readFirstMatch(selectorList) {
    for (const sel of selectorList) {
      const els = document.querySelectorAll(sel);
      if (els.length) {
        const cards = [];
        els.forEach((el) => {
          const c = readCardEl(el);
          if (c) cards.push(c);
        });
        if (cards.length) return dedupe(cards);
      }
    }
    return [];
  }

  function scrape() {
    return {
      hero: readFirstMatch(SELECTORS.hero).slice(0, 2),
      board: readFirstMatch(SELECTORS.board).slice(0, 5),
    };
  }

  PNO.scraper = { scrape, SELECTORS };
})();
