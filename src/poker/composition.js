// composition.js — break an inferred villain range into hand categories (pairs, high
// cards, suited speculative, other) and the share that's a stronger starting hand than
// the hero's. Answers "what does their preflop range actually look like — high or low?"
// Pure range math, no opponent data.
(function () {
  const PNO = (window.PNO = window.PNO || {});

  function bucketOf(hi, lo, type) {
    if (type === 'p') return 'pairs';
    if (hi >= 10 && lo >= 10) return 'high';   // broadway non-pair (both T+)
    if (type === 's') return 'suited';         // suited speculative (connectors, suited Ax)
    return 'other';                            // offsuit non-broadway
  }

  // Representative cards for a hand-class key, so we can look up its percentile.
  function keyToCards(key) {
    const parts = key.split('-');
    const hi = +parts[0], lo = +parts[1], type = parts[2];
    if (type === 's') return [{ rank: hi, suit: 0 }, { rank: lo, suit: 0 }];
    return [{ rank: hi, suit: 0 }, { rank: lo, suit: 1 }]; // pair or offsuit
  }

  // range: Set of hand-class keys (from PNO.ranges). hero: optional [c1, c2].
  function analyze(range, hero) {
    if (!range || !range.size) return null;
    const buckets = { pairs: 0, high: 0, suited: 0, other: 0 };
    let total = 0;
    let stronger = 0;
    const heroP = (hero && hero.length === 2 && PNO.ranges)
      ? PNO.ranges.handPercentile(hero[0], hero[1]) : null;

    range.forEach((key) => {
      const parts = key.split('-');
      const hi = +parts[0], lo = +parts[1], type = parts[2];
      const combos = type === 'p' ? 6 : type === 's' ? 4 : 12;
      total += combos;
      buckets[bucketOf(hi, lo, type)] += combos;
      if (heroP != null) {
        const cards = keyToCards(key);
        const p = PNO.ranges.handPercentile(cards[0], cards[1]);
        if (p != null && p < heroP) stronger += combos; // stronger starting hand
      }
    });

    const order = [['pairs', 'pairs'], ['high', 'high cards'], ['suited', 'suited'], ['other', 'other']];
    const list = order
      .map(([k, name]) => ({ name, count: buckets[k], pct: total ? buckets[k] / total : 0 }))
      .filter((b) => b.count > 0);

    return {
      total,
      buckets: list,
      strongerPct: heroP != null ? (total ? stronger / total : 0) : null,
    };
  }

  PNO.composition = { analyze, bucketOf };
})();
