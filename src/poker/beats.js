// beats.js — relative hand strength: of the holdings an opponent could have, how many
// currently beat the hero, and what they are, ranked. Pure combinatorics over the
// hero's own cards + the public board (no opponent data).
//
// #1 Range-weighting: pass a range Set (from PNO.ranges) to count only holdings a
//    realistic opponent would have, instead of all random combos.
// #2 Blockers: card removal is automatic (combos can't use the hero's cards), and we
//    also flag when the hero holds the nut-flush card, blocking that nut.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const evaluate = PNO.evaluator.evaluate;
  const cardId = PNO.cards.cardId;

  const CAT_UNIT = 16 * 16 * 16 * 16 * 16;
  const NAME = { 8: 'straight flush', 7: 'quads', 6: 'full house', 5: 'flush', 4: 'straight', 3: 'trips', 2: 'two pair', 1: 'pair', 0: 'high card' };
  const PLURAL = { 8: 'straight flushes', 7: 'quads', 6: 'full houses', 5: 'flushes', 4: 'straights', 3: 'sets', 2: 'two pair', 1: 'pairs', 0: 'high cards' };

  const catOf = (score) => Math.floor(score / CAT_UNIT);

  // Nut-flush blocker: if a flush is on/near the board and the hero holds the highest
  // missing card of that suit, opponents can't make the nut flush.
  function nutFlushBlocks(hole, board) {
    const out = [];
    const bySuit = [[], [], [], []];
    board.forEach((c) => bySuit[c.suit].push(c.rank));
    for (let s = 0; s < 4; s++) {
      if (bySuit[s].length < 3) continue; // a flush needs 3+ of a suit on board
      const onBoard = new Set(bySuit[s]);
      let nut = 0;
      for (let r = 14; r >= 2; r--) { if (!onBoard.has(r)) { nut = r; break; } }
      if (hole.some((c) => c.suit === s && c.rank === nut)) {
        out.push('nut flush (' + PNO.cards.RANK_STR[nut] + PNO.cards.SUIT_STR[s] + ')');
      }
    }
    return out;
  }

  // hole: 2 cards, board: 3..5 cards. rangeSet: optional Set of hand keys to weight by.
  function analyze(hole, board, rangeSet) {
    if (!hole || hole.length !== 2 || !board || board.length < 3) return null;

    const heroScore = evaluate(hole.concat(board));
    const dead = new Set(hole.concat(board).map(cardId));
    const unseen = [];
    for (let r = 2; r <= 14; r++) {
      for (let s = 0; s < 4; s++) {
        if (!dead.has(r * 4 + s)) unseen.push({ rank: r, suit: s });
      }
    }

    const useRange = (rangeSet && PNO.ranges) ? PNO.ranges.inRange : null;
    let ahead = 0, tied = 0, behind = 0;
    const cats = {};
    for (let i = 0; i < unseen.length; i++) {
      for (let j = i + 1; j < unseen.length; j++) {
        if (useRange && !useRange(rangeSet, unseen[i], unseen[j])) continue;
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
      aheadPct: total ? ahead / total : 0,
      behindPct: total ? behind / total : 0,
      heroCat: catOf(heroScore),
      heroCatName: NAME[catOf(heroScore)],
      categories,
      ranged: !!useRange,
      blocks: nutFlushBlocks(hole, board),
    };
  }

  PNO.beats = { analyze, catOf, nutFlushBlocks };
})();
