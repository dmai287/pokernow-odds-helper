// equity.js — Monte Carlo equity simulation and pot-odds math.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const { cardId } = PNO.cards;
  const { evaluate } = PNO.evaluator;

  function buildDeck(dead) {
    const deck = [];
    for (let r = 2; r <= 14; r++) {
      for (let s = 0; s < 4; s++) {
        if (!dead.has(r * 4 + s)) deck.push({ rank: r, suit: s });
      }
    }
    return deck;
  }

  // Draw `count` cards from pool[0..len) without replacement (swap-remove). Returns
  // the new length. Drawn cards are placed at the end (pool[len-count..len)).
  function drawCards(pool, len, count, dest) {
    for (let i = 0; i < count; i++) {
      const j = Math.floor(Math.random() * len);
      dest.push(pool[j]);
      len--;
      pool[j] = pool[len];
      pool[len] = dest[dest.length - 1];
    }
    return len;
  }

  // Estimate hero equity vs `opponents` hands by simulation.
  // hole: 2 cards, board: 0..5 cards.
  // villainRange: optional Set of hand keys (from PNO.ranges) restricting opponent
  //   hands; null/undefined = any two cards (random).
  // Returns { equity, win, tie, lose, iterations }.
  function monteCarlo(hole, board, opponents, iterations, villainRange) {
    if (!hole || hole.length !== 2) return null;
    opponents = Math.max(1, opponents | 0);
    iterations = Math.max(100, iterations | 0);

    const dead = new Set();
    for (const c of hole) dead.add(cardId(c));
    for (const c of board) dead.add(cardId(c));
    if (dead.size !== hole.length + board.length) return null; // duplicate card detected

    const baseDeck = buildDeck(dead);
    const needBoard = 5 - board.length;
    if (needBoard + opponents * 2 > baseDeck.length) return null;

    // villainRange may be a single Set/null (applied to every opponent) or an array of
    // Sets/nulls, one per opponent (e.g. a tight raiser + looser callers).
    const rangesArr = Array.isArray(villainRange) ? villainRange : null;
    const singleRange = rangesArr ? null : villainRange;
    const inRange = PNO.ranges ? PNO.ranges.inRange : null;
    const MAX_TRIES = 40; // rejection-sampling cap before falling back to any-two-cards

    let equitySum = 0, win = 0, tie = 0, lose = 0;
    const pool = baseDeck.slice();

    for (let it = 0; it < iterations; it++) {
      // Refill the working pool each iteration.
      for (let i = 0; i < baseDeck.length; i++) pool[i] = baseDeck[i];
      let len = baseDeck.length;

      const drawn = [];
      len = drawCards(pool, len, needBoard, drawn);
      const fullBoard = board.concat(drawn);
      const heroScore = evaluate(hole.concat(fullBoard));

      let oppMax = -1, oppTies = 0;
      for (let o = 0; o < opponents; o++) {
        let a, b;
        const vr = rangesArr ? (rangesArr[o] || null) : singleRange;
        if (inRange && vr) {
          // Rejection-sample a two-card hand within this villain's range. The pool is
          // left untouched while rejecting, so ia/ib stay valid until we accept.
          let tries = 0, ok = false, ia = 0, ib = 1;
          do {
            ia = Math.floor(Math.random() * len);
            ib = Math.floor(Math.random() * (len - 1));
            if (ib >= ia) ib++;
            a = pool[ia]; b = pool[ib];
            ok = inRange(vr, a, b);
          } while (!ok && ++tries < MAX_TRIES);
          // Remove both by swap-remove, higher index first to keep loI valid.
          const hiI = Math.max(ia, ib), loI = Math.min(ia, ib);
          len--; pool[hiI] = pool[len];
          len--; pool[loI] = pool[len];
        } else {
          const t = [];
          len = drawCards(pool, len, 2, t);
          a = t[0]; b = t[1];
        }
        const sc = evaluate([a, b].concat(fullBoard));
        if (sc > oppMax) { oppMax = sc; oppTies = 1; }
        else if (sc === oppMax) { oppTies++; }
      }

      if (heroScore > oppMax) { win++; equitySum += 1; }
      else if (heroScore < oppMax) { lose++; }
      else { tie++; equitySum += 1 / (oppTies + 1); } // split the pot among ties
    }

    return {
      equity: equitySum / iterations,
      win: win / iterations,
      tie: tie / iterations,
      lose: lose / iterations,
      iterations,
    };
  }

  // Pot odds: the breakeven equity needed to call. callAmount into a pot of potSize.
  // breakeven = call / (pot + call). +EV to call when equity > breakeven.
  function potOdds(potSize, callAmount) {
    potSize = Number(potSize) || 0;
    callAmount = Number(callAmount) || 0;
    if (callAmount <= 0) return null;
    return callAmount / (potSize + callAmount);
  }

  // Expected value (in chips) of calling `callAmount` to win a pot of `potSize`
  // (potSize is the chips already in the middle, including the villain's bet).
  // EV = equity * (pot + call) - call. Zero exactly at the pot-odds breakeven.
  function callEV(equity, potSize, callAmount) {
    potSize = Number(potSize) || 0;
    callAmount = Number(callAmount) || 0;
    return equity * (potSize + callAmount) - callAmount;
  }

  PNO.equity = { monteCarlo, potOdds, callEV };
})();
