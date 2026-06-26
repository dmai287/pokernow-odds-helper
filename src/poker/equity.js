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

  // Estimate hero equity vs `opponents` random hands by simulation.
  // hole: 2 cards, board: 0..5 cards. Returns { equity, win, tie, lose, iterations }.
  function monteCarlo(hole, board, opponents, iterations) {
    if (!hole || hole.length !== 2) return null;
    opponents = Math.max(1, opponents | 0);
    iterations = Math.max(100, iterations | 0);

    const dead = new Set();
    for (const c of hole) dead.add(cardId(c));
    for (const c of board) dead.add(cardId(c));
    if (dead.size !== hole.length + board.length) return null; // duplicate card detected

    const deck = buildDeck(dead);
    const needBoard = 5 - board.length;
    const need = needBoard + opponents * 2;
    if (need > deck.length) return null;

    let equitySum = 0, win = 0, tie = 0, lose = 0;

    for (let it = 0; it < iterations; it++) {
      // Partial Fisher-Yates: draw the first `need` cards from a fresh shuffle prefix.
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(Math.random() * (deck.length - i));
        const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
      }

      let idx = 0;
      const fullBoard = board.slice();
      for (let i = 0; i < needBoard; i++) fullBoard.push(deck[idx++]);

      const heroScore = evaluate(hole.concat(fullBoard));

      let oppMax = -1, oppTies = 0;
      for (let o = 0; o < opponents; o++) {
        const oc = [deck[idx++], deck[idx++]];
        const sc = evaluate(oc.concat(fullBoard));
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

  PNO.equity = { monteCarlo, potOdds };
})();
