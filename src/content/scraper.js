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
    pot: '.table-pot-size',                // pot display, e.g. "300total 450"
    player: '.table-player',               // each seat (filtered to table-player-N)
    bet: '.table-player-bet-value',        // a player's current-street bet
  };

  // Pull all numbers out of a string (commas stripped).
  function nums(s) {
    const m = (s || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/g);
    return m ? m.map(Number) : [];
  }

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

  // Total pot. The element reads like "300total 450" (main pot + total incl. current
  // bets). The total is what matters for pot odds; fall back to the largest number.
  function readPot() {
    const el = document.querySelector(SELECTORS.pot);
    if (!el) return null;
    const txt = el.textContent || '';
    const m = txt.match(/total\s*([\d,]+)/i);
    if (m) return Number(m[1].replace(/,/g, ''));
    const all = nums(txt);
    return all.length ? Math.max(...all) : null;
  }

  function seatBet(seat) {
    const el = seat.querySelector(SELECTORS.bet);
    const n = el ? nums(el.textContent) : [];
    return n.length ? n[0] : 0;
  }

  // Read seats, the amount the hero must call, and the count of live opponents.
  function readSeats() {
    const seats = Array.prototype.filter.call(
      document.querySelectorAll(SELECTORS.player),
      (s) => /\btable-player-\d+\b/.test(s.className)
    );

    let maxBet = 0, heroBet = 0, opponents = 0;
    seats.forEach((s) => {
      const cls = s.className;
      const isHero = /\byou-player\b/.test(cls);
      const folded = /\bfold\b/.test(cls);
      const hasCards = !!s.querySelector(SELECTORS.card);
      const bet = seatBet(s);
      if (bet > maxBet) maxBet = bet;
      if (isHero) heroBet = bet;
      else if (!folded && hasCards) opponents++;
    });

    return { call: Math.max(0, maxBet - heroBet), opponents };
  }

  function scrape() {
    const seats = readSeats();
    return {
      hero: readCardsIn(SELECTORS.heroContainer).slice(0, 2),
      board: readCardsIn(SELECTORS.boardContainer).slice(0, 5),
      pot: readPot(),
      call: seats.call,
      opponents: seats.opponents,
    };
  }

  PNO.scraper = { scrape, SELECTORS, readContainer, readPot, readSeats };
})();
