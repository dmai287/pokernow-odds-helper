// draws.js — detects hero's drawing hands (flush / straight) on the flop and turn,
// counts outs, and estimates the chance to improve by the river.
//
// Outs here mean cards that complete a flush or straight FOR HERO (a draw the hero
// holds, not one available to the whole table via the board alone). The Monte Carlo
// engine still produces the actual win equity; these labels are explanatory.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const { cardId } = PNO.cards;

  function presenceOf(cards) {
    const p = new Array(15).fill(false);
    cards.forEach((c) => { p[c.rank] = true; });
    return p;
  }

  // Is a 5-card straight fully present? Handles the wheel (A-2-3-4-5).
  function hasStraight(present) {
    for (let high = 14; high >= 5; high--) {
      let ok = true;
      for (let k = 0; k < 5; k++) {
        let r = high - k;
        if (r === 1) r = 14;
        if (!present[r]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  // hole: 2 cards, board: 3 or 4 cards. Returns
  //   { draws: [{name, outs}], outs: <deduped total>, note: '~X% to hit by river' }
  function analyze(hole, board) {
    const res = { draws: [], outs: 0, note: '' };
    if (!hole || hole.length !== 2) return res;
    const n = board.length;
    if (n < 3 || n > 4) return res; // draws only meaningful on the flop/turn

    const all = hole.concat(board);
    const dead = new Set(all.map(cardId));

    // ---- Flush draw: exactly 4 of one suit, with at least one hero card in it ----
    const suitCount = [0, 0, 0, 0], heroSuit = [0, 0, 0, 0];
    all.forEach((c) => { suitCount[c.suit]++; });
    hole.forEach((c) => { heroSuit[c.suit]++; });
    let flushSuit = -1;
    for (let s = 0; s < 4; s++) if (suitCount[s] === 4 && heroSuit[s] >= 1) flushSuit = s;

    const flushOuts = new Set();
    if (flushSuit >= 0) {
      for (let r = 2; r <= 14; r++) {
        const id = r * 4 + flushSuit;
        if (!dead.has(id)) flushOuts.add(id);
      }
      res.draws.push({ name: 'Flush draw', outs: flushOuts.size });
    }

    // ---- Straight draws: ranks that complete a straight the hero benefits from ----
    const present = presenceOf(all);
    const boardPresent = presenceOf(board);
    const straightOuts = new Set();
    let completingRanks = 0;

    if (!hasStraight(present)) {
      for (let r = 2; r <= 14; r++) {
        if (present[r]) continue; // a straight out is always a new rank
        present[r] = true;
        const heroMakes = hasStraight(present);
        present[r] = false;
        if (!heroMakes) continue;
        // Exclude straights the board makes on its own (no edge for hero).
        boardPresent[r] = true;
        const boardMakes = hasStraight(boardPresent);
        boardPresent[r] = false;
        if (boardMakes) continue;
        completingRanks++;
        for (let s = 0; s < 4; s++) {
          const id = r * 4 + s;
          if (!dead.has(id)) straightOuts.add(id);
        }
      }
      if (completingRanks > 0) {
        res.draws.push({
          name: completingRanks >= 2 ? 'Open-ended straight draw' : 'Gutshot',
          outs: straightOuts.size,
        });
      }
    }

    // De-duplicate cards that complete both a flush and a straight.
    const union = new Set([...flushOuts, ...straightOuts]);
    res.outs = union.size;

    if (res.outs > 0) {
      // Rule of 4 (flop) / 2 (turn) — a quick approximation of hitting by the river.
      const pct = res.outs * (n === 3 ? 4 : 2);
      res.note = `~${Math.min(95, pct)}% to hit by river`;
    }
    return res;
  }

  PNO.draws = { analyze };
})();
