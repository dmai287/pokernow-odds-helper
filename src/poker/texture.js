// texture.js — board texture: objective facts about the board, plus a small set of
// single-street strategy notes.
//
// Scope is deliberately narrow. An adversarial review of a large texture→advice rule
// table found almost all of it unsound or unimplementable here, because:
//   - the tool has NO within-hand action history, so multi-street scripts ("barrel the
//     turn", "fold to the second barrel") cannot be expressed;
//   - a flop rule must not pre-commit to a turn it cannot see (the card that completes
//     the draw promotes the calling range past a bare overpair);
//   - paired boards break naive "overpair" logic (99 on 8-8-5 is not an overpair);
//   - the rule of 4 is wrong on a one-card street (a combo draw is ~54% from the flop
//     but ~34% on the turn).
// So: facts are exact, and notes are few, gated on the equity/SPR the engine already
// computes, split on facing-a-bet vs checked-to, and never reference a future street.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const evaluate = PNO.evaluator.evaluate;

  const CAT_NAME = {
    8: 'straight flush', 7: 'quads', 6: 'full house', 5: 'flush',
    4: 'straight', 3: 'trips', 2: 'two pair', 1: 'pair', 0: 'high card',
  };

  // Highest count of board ranks inside any 5-rank straight window (ace plays high+low).
  function straightWindow(board) {
    const present = new Array(15).fill(false);
    board.forEach((c) => { present[c.rank] = true; });
    let best = 0;
    for (let high = 14; high >= 5; high--) {
      let n = 0;
      for (let k = 0; k < 5; k++) {
        let r = high - k;
        if (r === 1) r = 14; // wheel
        if (present[r]) n++;
      }
      if (n > best) best = n;
    }
    return best;
  }

  // hole: 2 cards, board: 3..5 cards. Returns exact texture facts, or null pre-flop.
  function analyze(hole, board) {
    if (!hole || hole.length !== 2 || !board || board.length < 3) return null;

    const cardsToCome = 5 - board.length;
    const street = board.length >= 5 ? 'river' : board.length === 4 ? 'turn' : 'flop';

    // Suits (board only).
    const suitCount = [0, 0, 0, 0];
    board.forEach((c) => { suitCount[c.suit]++; });
    let flushSuit = 0;
    for (let s = 1; s < 4; s++) if (suitCount[s] > suitCount[flushSuit]) flushSuit = s;
    const boardSuitMax = suitCount[flushSuit];
    const heroSuited = hole.filter((c) => c.suit === flushSuit).length;

    // Ranks (board only).
    const rankCount = {};
    board.forEach((c) => { rankCount[c.rank] = (rankCount[c.rank] || 0) + 1; });
    const counts = Object.keys(rankCount).map((k) => rankCount[k]);
    const paired = counts.some((n) => n >= 2);
    const trips = counts.some((n) => n >= 3);
    const swMax = straightWindow(board);

    const heroScore = evaluate(hole.concat(board));
    const heroCat = PNO.beats ? PNO.beats.catOf(heroScore) : null;
    const pocketPair = hole[0].rank === hole[1].rank;
    const topBoardRank = Math.max.apply(null, board.map((c) => c.rank));

    const facts = {
      street, cardsToCome,
      // flush
      boardSuitMax, flushSuit,
      rainbow: boardSuitMax <= 1,
      twoTone: boardSuitMax === 2,
      monotone: boardSuitMax >= 3,
      flushPossible: boardSuitMax >= 3,          // someone can already hold a flush
      flushDrawLive: boardSuitMax === 2 && cardsToCome > 0, // "about to hit a flush"
      heroSuited,
      // straight
      swMax,
      connected: swMax >= 3,
      straightPossible: swMax >= 3,              // 2 hole cards complete it
      straightNearlyThere: swMax >= 4,           // a single card completes it
      straightDrawLive: swMax >= 3 && cardsToCome > 0,      // "about to hit a straight"
      // pairing
      paired, trips,
      // hero
      heroCat, heroCatName: CAT_NAME[heroCat],
      pocketPair,
      // Only meaningful on an UNPAIRED board — 99 on 8-8-5 is not an overpair.
      heroOverpair: !paired && pocketPair && heroCat === 1 && hole[0].rank > topBoardRank,
      heroUnderpair: !paired && pocketPair && heroCat === 1 && hole[0].rank < topBoardRank,
      heroSet: pocketPair && heroCat === 3,
      heroHasFlush: heroCat === 5 || heroCat === 8,
      heroHasStraight: heroCat === 4,
    };

    facts.wetness = (facts.monotone || facts.straightNearlyThere ||
                     (facts.flushDrawLive && facts.connected)) ? 'very wet'
                  : (facts.flushDrawLive || facts.connected) ? 'wet' : 'dry';
    // A strong made hand for protection purposes (unpaired boards only).
    facts.strongMade = !paired && (facts.heroSet || heroCat === 2 || facts.heroOverpair);
    return facts;
  }

  // One most-relevant note for THIS street, or null.
  // ctx: { equity, toCall, spr }
  function note(f, ctx) {
    if (!f) return null;
    const c = ctx || {};
    const eq = typeof c.equity === 'number' ? c.equity : null;
    const toCall = Number(c.toCall) || 0;
    const spr = typeof c.spr === 'number' ? c.spr : null;
    const suit = PNO.cards.SUIT_STR[f.flushSuit];

    // 1. A flush is already possible and you don't have one.
    if (f.flushPossible && !f.heroHasFlush && f.heroCat >= 1) {
      return `${f.boardSuitMax}${suit} on board — a flush is already possible and your ` +
             `${f.heroCatName} doesn't beat one. Pot-control; don't stack off without a redraw.`;
    }
    // 2. One card completes a straight and you don't have one.
    if (f.straightNearlyThere && !f.heroHasStraight && f.heroCat < 4 && f.heroCat >= 1) {
      return `4 to a straight on board — a single card makes it, and your ${f.heroCatName} ` +
             `doesn't beat one. Proceed cautiously.`;
    }
    // 3. Paired board with a flush/straight — full houses are live.
    if (f.paired && (f.heroHasFlush || f.heroHasStraight)) {
      return `Board is paired — full houses are live, so your ${f.heroCatName} is no longer the nuts.`;
    }
    // 4. The user's case: strong made hand while a draw is still live → charge it.
    if (f.strongMade && (f.flushDrawLive || f.straightDrawLive) && eq != null && eq >= 0.60) {
      const draw = f.flushDrawLive && f.straightDrawLive ? 'flush + straight draws'
                 : f.flushDrawLive ? `a flush draw (2${suit})` : 'straight draws';
      if (toCall > 0) {
        return `${draw} live with your ${f.heroCatName} — raise rather than call; ` +
               `take the extra street while you're ahead.`;
      }
      const size = (spr != null && spr <= 4) ? '¾ pot (sets up a shove at this SPR)' : '≈⅔ pot';
      const hit = f.cardsToCome === 1 ? '~19% on this card alone' : '~35% by the river';
      return `${draw} live with your ${f.heroCatName} — bet ${size} to charge it ` +
             `(a 9-out draw hits ${hit}). Don't slowplay.`;
    }
    // 5. Dry board with a strong hand — no draws to charge.
    if (f.strongMade && f.wetness === 'dry' && toCall === 0) {
      return `Dry board (${f.rainbow ? 'rainbow' : 'no draws'}) — little to protect against; ` +
             `a smaller bet (⅓–½ pot) gets called by more.`;
    }
    // 6. Underpair staring at overcards.
    if (f.heroUnderpair && eq != null && eq < 0.45) {
      return `Overcards on the board — your underpair is behind a lot of the range; ` +
             `keep the pot small.`;
    }
    return null;
  }

  PNO.texture = { analyze, note, straightWindow };
})();
