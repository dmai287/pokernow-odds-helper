// ranges.js — preflop hand-strength ranking and "top X%" range construction.
//
// Used to model opponents as holding a range of strong-ish hands rather than any two
// random cards, which makes equity (and the resulting advice) more realistic when
// facing action. Hands are scored with the Chen formula — a well-known preflop
// heuristic — then ordered, and a percentile cutoff selects the range.
(function () {
  const PNO = (window.PNO = window.PNO || {});

  // Chen formula score for a starting hand (r1, r2 are ranks 2..14; suited bool).
  function chenScore(r1, r2, suited) {
    const high = Math.max(r1, r2), low = Math.min(r1, r2);
    const pts = (r) => {
      if (r === 14) return 10;
      if (r === 13) return 8;
      if (r === 12) return 7;
      if (r === 11) return 6;
      return r / 2;
    };
    if (r1 === r2) return Math.max(5, pts(r1) * 2); // pair

    let score = pts(high);
    if (suited) score += 2;
    const gap = high - low - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    if (gap <= 1 && high < 12) score += 1; // 0/1-gap straight bonus, both below Q
    return Math.round(score);
  }

  // Canonical key for a two-card hand: "14-14-p" (pair), "14-13-s" (suited),
  // "14-13-o" (offsuit).
  function handKey(c1, c2) {
    const high = Math.max(c1.rank, c2.rank);
    const low = Math.min(c1.rank, c2.rank);
    if (high === low) return high + '-' + low + '-p';
    const suited = c1.suit === c2.suit;
    return high + '-' + low + '-' + (suited ? 's' : 'o');
  }

  // All 169 hand classes with combo counts and Chen scores.
  function buildAllHands() {
    const hands = [];
    for (let hi = 14; hi >= 2; hi--) {
      for (let lo = hi; lo >= 2; lo--) {
        if (hi === lo) {
          hands.push({ key: hi + '-' + lo + '-p', combos: 6, score: chenScore(hi, lo, false) });
        } else {
          hands.push({ key: hi + '-' + lo + '-s', combos: 4, score: chenScore(hi, lo, true) });
          hands.push({ key: hi + '-' + lo + '-o', combos: 12, score: chenScore(hi, lo, false) });
        }
      }
    }
    return hands;
  }

  const ALL_HANDS = buildAllHands();
  const TOTAL_COMBOS = 1326; // C(52,2)

  // Build the set of hand keys making up the strongest `pct` (0..1) of all combos.
  function topPercent(pct) {
    if (pct >= 1) return null; // null = any two cards (no filtering)
    const target = Math.max(1, Math.round(pct * TOTAL_COMBOS));
    const sorted = ALL_HANDS.slice().sort((a, b) => b.score - a.score);
    const set = new Set();
    let acc = 0;
    for (const h of sorted) {
      set.add(h.key);
      acc += h.combos;
      if (acc >= target) break;
    }
    return set;
  }

  function inRange(rangeSet, c1, c2) {
    if (!rangeSet) return true; // null range = always in
    return rangeSet.has(handKey(c1, c2));
  }

  // Infer how tight opponents' range should be from the action, as a top-fraction
  // (0..1). Bigger bets relative to the pot imply stronger, tighter ranges; a limped
  // or checked pot implies a wide one. Heuristic — it reads aggression, not hands.
  function tightnessFromAction(pot, call, boardLen) {
    pot = Number(pot) || 0;
    call = Number(call) || 0;
    const preflop = (boardLen || 0) === 0;

    if (call <= 0) return preflop ? 0.60 : 0.65;   // no bet faced: limped / checked
    if (!(pot > 0)) return 0.50;                    // bet but pot unknown

    const potBefore = Math.max(1, pot - call);      // pot before the facing bet (approx)
    const ratio = call / potBefore;
    if (ratio < 0.4) return 0.50;                   // small bet
    if (ratio < 0.8) return 0.35;                   // half-ish pot
    if (ratio < 1.5) return 0.22;                   // pot-ish
    return 0.12;                                    // overbet / big raise
  }

  PNO.ranges = {
    chenScore, handKey, topPercent, inRange, tightnessFromAction, ALL_HANDS, TOTAL_COMBOS,
  };
})();
