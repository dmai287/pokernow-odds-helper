// bots.js — AI opponents for the practice simulator. Each style plays by combining
// Monte Carlo equity (from the existing engine) with style parameters. Because these
// are bots, studying their tendencies is fair practice.
(function () {
  const PNO = (window.PNO = window.PNO || {});

  const STYLES = [
    { name: 'Rocky (rock)', tag: 'tight-passive', preflopPlay: 0.14, openPct: 0.14, threeBet: 0.03, valueBet: 0.62, betFrac: 0.5, bluff: 0.03, aggr: 0.2, slack: 0.0 },
    { name: 'Tina (TAG)', tag: 'tight-aggressive', preflopPlay: 0.20, openPct: 0.22, threeBet: 0.06, valueBet: 0.58, betFrac: 0.66, bluff: 0.15, aggr: 0.5, slack: 0.0 },
    { name: 'Leo (LAG)', tag: 'loose-aggressive', preflopPlay: 0.38, openPct: 0.42, threeBet: 0.10, valueBet: 0.52, betFrac: 0.75, bluff: 0.28, aggr: 0.7, slack: 0.02 },
    { name: 'Cal (station)', tag: 'loose-passive', preflopPlay: 0.45, openPct: 0.30, threeBet: 0.02, valueBet: 0.60, betFrac: 0.4, bluff: 0.03, aggr: 0.1, slack: 0.12 },
    { name: 'Max (maniac)', tag: 'hyper-aggressive', preflopPlay: 0.60, openPct: 0.60, threeBet: 0.16, valueBet: 0.50, betFrac: 0.9, bluff: 0.45, aggr: 0.85, slack: 0.05 },
  ];

  const ITERS = 500; // light Monte Carlo so bots act fast

  function decide(g, i) {
    const p = g.players[i];
    const st = p.style;
    const board = g.board;
    const toCall = g.currentBet - p.streetBet;
    const potNow = PNO.sim.pot(g);
    const opponents = Math.max(1, PNO.sim.liveIdxs(g).length - 1);

    // Raise/bet target builder, clamped to stack.
    const maxTo = p.streetBet + p.stack;
    const betTo = (frac) => {
      const base = g.currentBet > 0 ? g.currentBet : 0;
      const raiseBy = Math.max(g.lastRaiseSize, Math.round((potNow + toCall) * frac));
      return Math.min(maxTo, base + raiseBy);
    };
    const raiseAction = (frac) => {
      const target = betTo(frac);
      if (target >= maxTo) return { type: 'allin' };
      return { type: g.currentBet > 0 ? 'raise' : 'bet', amount: target };
    };

    // ---- Preflop: play by hand strength percentile ----
    if (board.length === 0) {
      const pct = PNO.ranges.handPercentile(p.hole[0], p.hole[1]);
      const facing = toCall > 0 && g.currentBet > g.bb; // a raise, not just the BB
      if (facing) {
        if (pct <= st.threeBet) return raiseAction(0.9);
        if (pct <= st.preflopPlay + st.slack) return { type: 'call' };
        return { type: 'fold' };
      }
      // unraised (limp/BB option)
      if (pct <= st.openPct) {
        return Math.random() < 0.85 ? raiseAction(0.6) : (toCall > 0 ? { type: 'call' } : { type: 'check' });
      }
      return toCall > 0 ? { type: 'fold' } : { type: 'check' };
    }

    // ---- Postflop: equity-driven ----
    const res = PNO.equity.monteCarlo(p.hole, board, opponents, ITERS, null);
    const e = res ? res.equity : 0.5;

    if (toCall <= 0) {
      if (e >= st.valueBet) return raiseAction(st.betFrac);
      if (Math.random() < st.bluff) return raiseAction(st.betFrac);
      return { type: 'check' };
    }

    const breakeven = toCall / (potNow + toCall);
    if (e >= 0.80 || (e >= breakeven + 0.20 && Math.random() < st.aggr)) return raiseAction(st.betFrac);
    if (e >= breakeven - st.slack) return { type: 'call' };
    // occasional bluff-raise for aggressive styles
    if (Math.random() < st.bluff * 0.5) return raiseAction(st.betFrac);
    return { type: 'fold' };
  }

  PNO.bots = { decide, STYLES };
})();
