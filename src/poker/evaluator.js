// evaluator.js — best 5-card hand evaluator for up to 7 cards.
// evaluate(cards) returns an integer score; higher is a better hand. Scores are
// directly comparable across all hands (category is the most significant component).
(function () {
  const PNO = (window.PNO = window.PNO || {});

  // Hand categories (high to low): 8 straight flush ... 0 high card.
  // Encode category + up to 5 tiebreaker ranks into a fixed-width base-16 number
  // so that a higher category always outranks a lower one regardless of kickers.
  function makeScore(category, tiebreakers) {
    let score = category;
    for (let i = 0; i < 5; i++) {
      score = score * 16 + (tiebreakers[i] || 0);
    }
    return score;
  }

  // Given boolean rank-presence array (index 2..14), return the high card of the
  // best straight, or 0. Handles the wheel (A-2-3-4-5).
  function bestStraightHigh(present) {
    for (let high = 14; high >= 5; high--) {
      let ok = true;
      for (let k = 0; k < 5; k++) {
        let r = high - k;
        if (r === 1) r = 14; // ace plays low in the wheel
        if (!present[r]) { ok = false; break; }
      }
      if (ok) return high;
    }
    return 0;
  }

  function topKickers(exclude, rankCount, n) {
    const out = [];
    for (let r = 14; r >= 2 && out.length < n; r--) {
      if (exclude.indexOf(r) !== -1) continue;
      if (rankCount[r] > 0) out.push(r);
    }
    return out;
  }

  function evaluate(cards) {
    const rankCount = new Array(15).fill(0);
    const suitCount = [0, 0, 0, 0];
    const suitRanks = [[], [], [], []];
    const present = new Array(15).fill(false);

    for (const c of cards) {
      rankCount[c.rank]++;
      suitCount[c.suit]++;
      suitRanks[c.suit].push(c.rank);
      present[c.rank] = true;
    }

    let flushSuit = -1;
    for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flushSuit = s;

    // Straight flush
    if (flushSuit >= 0) {
      const fp = new Array(15).fill(false);
      for (const r of suitRanks[flushSuit]) fp[r] = true;
      const sf = bestStraightHigh(fp);
      if (sf) return makeScore(8, [sf]);
    }

    // Group ranks by multiplicity (high to low).
    const quads = [], trips = [], pairs = [];
    for (let r = 14; r >= 2; r--) {
      if (rankCount[r] === 4) quads.push(r);
      else if (rankCount[r] === 3) trips.push(r);
      else if (rankCount[r] === 2) pairs.push(r);
    }

    // Four of a kind
    if (quads.length) {
      const kicker = topKickers([quads[0]], rankCount, 1)[0] || 0;
      return makeScore(7, [quads[0], kicker]);
    }

    // Full house (trips + pair, or two sets of trips)
    if (trips.length >= 1 && (pairs.length >= 1 || trips.length >= 2)) {
      const three = trips[0];
      let pairRank = trips.length >= 2 ? trips[1] : 0;
      if (pairs.length >= 1) pairRank = Math.max(pairRank, pairs[0]);
      return makeScore(6, [three, pairRank]);
    }

    // Flush
    if (flushSuit >= 0) {
      const rs = suitRanks[flushSuit].slice().sort((a, b) => b - a).slice(0, 5);
      return makeScore(5, rs);
    }

    // Straight
    const st = bestStraightHigh(present);
    if (st) return makeScore(4, [st]);

    // Three of a kind
    if (trips.length) {
      return makeScore(3, [trips[0], ...topKickers([trips[0]], rankCount, 2)]);
    }

    // Two pair
    if (pairs.length >= 2) {
      return makeScore(2, [pairs[0], pairs[1], ...topKickers([pairs[0], pairs[1]], rankCount, 1)]);
    }

    // One pair
    if (pairs.length === 1) {
      return makeScore(1, [pairs[0], ...topKickers([pairs[0]], rankCount, 3)]);
    }

    // High card
    return makeScore(0, topKickers([], rankCount, 5));
  }

  PNO.evaluator = { evaluate };
})();
