// cards.js — card constants, parsing, and formatting.
// Cards are represented as { rank: 2..14, suit: 0..3 } where suit 0=s 1=h 2=d 3=c.
(function () {
  const PNO = (window.PNO = window.PNO || {});

  const RANKS = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };

  const SUITS = {
    's': 0, 'h': 1, 'd': 2, 'c': 3,
    '♠': 0, '♥': 1, '♦': 2, '♣': 3,
  };

  const RANK_STR = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
  };

  const SUIT_STR = ['♠', '♥', '♦', '♣'];

  // Parse strings like "As", "Td", "10h", "A♠", "9♣" → { rank, suit } or null.
  function parseCard(str) {
    if (!str) return null;
    const s = String(str).trim();
    const m = s.match(/^(10|[2-9tjqka])\s*([shdc♠♥♦♣])$/i);
    if (!m) return null;
    let r = m[1].toUpperCase();
    if (r === '10') r = 'T';
    const rank = RANKS[r];
    let suit = SUITS[m[2]];
    if (suit === undefined) suit = SUITS[m[2].toLowerCase()];
    if (rank === undefined || suit === undefined) return null;
    return { rank, suit };
  }

  function cardToStr(c) {
    if (!c) return '';
    return RANK_STR[c.rank] + SUIT_STR[c.suit];
  }

  // Unique 0..51 id for dedup / dead-card tracking.
  function cardId(c) {
    return c.rank * 4 + c.suit;
  }

  function dedupe(cards) {
    const seen = new Set();
    const out = [];
    for (const c of cards) {
      const id = cardId(c);
      if (!seen.has(id)) {
        seen.add(id);
        out.push(c);
      }
    }
    return out;
  }

  PNO.cards = { RANKS, SUITS, RANK_STR, SUIT_STR, parseCard, cardToStr, cardId, dedupe };
})();
