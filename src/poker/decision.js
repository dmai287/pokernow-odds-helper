// decision.js — turns equity + pot odds into a suggested action.
// This is a heuristic for studying decisions. It does NOT model position, opponent
// ranges, fold equity, stack depth, or implied odds — treat it as a sanity check on
// the raw math, not gospel.
(function () {
  const PNO = (window.PNO = window.PNO || {});

  const pct = (x) => (x * 100).toFixed(1) + '%';

  // Absolute-equity thresholds for raising/betting for value.
  const VALUE_RAISE = 0.66;   // strong favorite → raise when facing a bet
  const VALUE_BET = 0.60;     // good favorite → bet when checked to
  const THIN_BET = 0.50;      // marginal → still worth a bet vs one opponent
  const RAISE_MARGIN = 0.15;  // equity must clear pot odds by this much to raise
  const CLOSE_FOLD = 0.05;    // within this of pot odds = a "close" fold

  // input: { equity, pot, call, opponents }
  // returns: { action, tone: 'good'|'neutral'|'bad', reason }
  function decide(input) {
    const equity = input.equity;
    const pot = Number(input.pot) || 0;
    const call = Number(input.call) || 0;
    const heads = (input.opponents || 1) <= 1;

    if (equity == null) {
      return { action: '—', tone: 'neutral', reason: 'Enter your hole cards.' };
    }

    // No bet to call: choose between betting/checking.
    if (call <= 0) {
      if (equity >= VALUE_BET) {
        return { action: 'Bet / Raise', tone: 'good',
          reason: `Strong equity (${pct(equity)}) — bet for value.` };
      }
      if (heads && equity >= THIN_BET) {
        return { action: 'Bet (thin)', tone: 'neutral',
          reason: `Slight edge (${pct(equity)}) heads-up — a thin value bet is fine, or check.` };
      }
      if (equity >= 0.40) {
        return { action: 'Check', tone: 'neutral',
          reason: `Middling equity (${pct(equity)}) — check and keep the pot small.` };
      }
      return { action: 'Check / give up', tone: 'bad',
        reason: `Weak equity (${pct(equity)}) — check; fold to pressure.` };
    }

    // Facing a bet: compare equity to the pot-odds breakeven.
    const breakeven = call / (pot + call);
    const margin = equity - breakeven;

    if (equity < breakeven) {
      if (breakeven - equity <= CLOSE_FOLD) {
        return { action: 'Fold (close)', tone: 'bad',
          reason: `Just short of pot odds — need ${pct(breakeven)}, have ${pct(equity)}. ` +
                  `Fold unless implied odds are strong.` };
      }
      return { action: 'Fold', tone: 'bad',
        reason: `Below pot odds — need ${pct(breakeven)}, have ${pct(equity)}.` };
    }

    // Profitable to continue.
    if (equity >= VALUE_RAISE && margin >= RAISE_MARGIN) {
      return { action: 'Raise', tone: 'good',
        reason: `Big edge — ${pct(equity)} vs ${pct(breakeven)} needed. Raise for value.` };
    }
    return { action: 'Call', tone: 'good',
      reason: `+EV call — ${pct(equity)} vs ${pct(breakeven)} needed.` };
  }

  PNO.decision = { decide };
})();
