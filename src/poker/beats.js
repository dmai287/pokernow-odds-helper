// beats.js — relative hand strength: of every possible two-card holding, how many
// currently beat the hero, and what they are, ranked. Pure combinatorics over the
// hero's own cards + the public board (no opponent data) — same class of math as the
// equity number. Meaningful from the flop onward.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const evaluate = PNO.evaluator.evaluate;
  const cardId = PNO.cards.cardId;

  const CAT_UNIT = 16 * 16 * 16 * 16 * 16; // makeScore multiplies category by 16^5
  const NAME = { 8: 'straight flush', 7: 'quads', 6: 'full house', 5: 'flush', 4: 'straight', 3: 'trips', 2: 'two pair', 1: 'pair', 0: 'high card' };
  const PLURAL = { 8: 'straight flushes', 7: 'quads', 6: 'full houses', 5: 'flushes', 4: 'straights', 3: 'sets', 2: 'two pair', 1: 'pairs', 0: 'high cards' };

  const catOf = (score) => Math.floor(score / CAT_UNIT);

  // hole: 2 cards, board: 3..5 cards. Returns the breakdown, or null pre-flop.
  function analyze(hole, board) {
    if (!hole || hole.length !== 2 || !board || board.length < 3) return null;

    const heroScore = evaluate(hole.concat(board));
    const dead = new Set(hole.concat(board).map(cardId));
    const unseen = [];
    for (let r = 2; r <= 14; r++) {
      for (let s = 0; s < 4; s++) {
        if (!dead.has(r * 4 + s)) unseen.push({ rank: r, suit: s });
      }
    }

    let ahead = 0, tied = 0, behind = 0;
    const cats = {};
    for (let i = 0; i < unseen.length; i++) {
      for (let j = i + 1; j < unseen.length; j++) {
        const sc = evaluate([unseen[i], unseen[j]].concat(board));
        if (sc > heroScore) { ahead++; const c = catOf(sc); cats[c] = (cats[c] || 0) + 1; }
        else if (sc === heroScore) tied++;
        else behind++;
      }
    }
    const total = ahead + tied + behind;
    const categories = Object.keys(cats)
      .map((k) => ({ cat: +k, name: PLURAL[+k], count: cats[k] }))
      .sort((a, b) => b.cat - a.cat);

    return {
      total, ahead, tied, behind,
      aheadPct: total ? ahead / total : 0,    // share of holdings that beat the hero
      behindPct: total ? behind / total : 0,  // share the hero beats
      heroCat: catOf(heroScore),
      heroCatName: NAME[catOf(heroScore)],
      categories,
    };
  }

  PNO.beats = { analyze, catOf };
})();
