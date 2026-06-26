// scraper.js — reads cards from PokerNow's table DOM.
//
// PokerNow renders each card as:
//   <div class="card-container card-d card-s-K flipped card-p1 med">
//     <div class="card-flipper">
//       <div class="front"></div>
//       <div class="card"><span class="value">K</span><span class="suit">d</span>...</div>
//     </div>
//   </div>
// The container's CSS classes encode the card: "card-<suit>" (card-s/h/d/c) and
// "card-s-<rank>" (e.g. card-s-K). Face-down cards lack those classes. We parse the
// class encoding first (most reliable), then fall back to the value/suit spans.
//
// Selectors are centralized below so they can be retuned if PokerNow's markup changes.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const { parseCard, RANKS, dedupe } = PNO.cards;

  const SELECTORS = {
    heroContainer: '.you-player',          // the seated user's player box
    boardContainer: '.table-cards',        // community cards
    card: '.card-container',               // one element per card
  };

  // Read a card from a .card-container element. Returns { rank, suit } or null
  // (null for face-down / unknown cards).
  function readContainer(container) {
    let rank, suit;

    container.classList.forEach((cls) => {
      if (cls === 'card-s' || cls === 'card-h' || cls === 'card-d' || cls === 'card-c') {
        suit = PNO.cards.SUITS[cls.slice(5)]; // 's'|'h'|'d'|'c'
      } else if (cls.indexOf('card-s-') === 0) {
        const r = cls.slice('card-s-'.length).toUpperCase(); // e.g. "K", "10", "5"
        if (RANKS[r] !== undefined) rank = RANKS[r];
      }
    });

    if (rank !== undefined && suit !== undefined) return { rank, suit };

    // Fallback: read the inner value/suit spans (e.g. "K" + "d").
    const inner = container.querySelector('.card');
    if (inner) {
      const v = inner.querySelector('.value');
      const s = inner.querySelector('.suit');
      if (v && s) {
        const c = parseCard((v.textContent || '').trim() + (s.textContent || '').trim());
        if (c) return c;
      }
    }
    return null;
  }

  function readCardsIn(rootSelector) {
    const root = document.querySelector(rootSelector);
    if (!root) return [];
    const cards = [];
    root.querySelectorAll(SELECTORS.card).forEach((el) => {
      const c = readContainer(el);
      if (c) cards.push(c);
    });
    return dedupe(cards);
  }

  function scrape() {
    return {
      hero: readCardsIn(SELECTORS.heroContainer).slice(0, 2),
      board: readCardsIn(SELECTORS.boardContainer).slice(0, 5),
    };
  }

  PNO.scraper = { scrape, SELECTORS, readContainer };
})();
