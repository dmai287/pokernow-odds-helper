// preflop.js — position-aware starting-hand advice.
//
// Preflop, position and hand strength matter more than raw equity-vs-random, so this
// uses opening ranges by seat (and a tighter range vs. a raise) rather than the
// postflop equity/pot-odds decision. Strength comes from the Chen-formula percentile
// in ranges.js. Heuristic ranges — reasonable defaults, not a solver.
(function () {
  const PNO = (window.PNO = window.PNO || {});

  // Fraction of hands to open-raise (when folded to you) by position.
  const OPEN_RANGE = {
    'Early/Middle': 0.15,
    'Cutoff': 0.27,
    'Button': 0.45,
    'Small blind': 0.40,
    'Big blind': 0.40,
  };
  const DEFAULT_OPEN = 0.20;

  // vs. a raise: 3-bet the very top, call/continue with the next tier, fold the rest.
  const THREE_BET = 0.04;
  const CALL_RAISE = 0.10;
  const SHORT_STACK_BB = 20; // at/below this, play push-or-fold rather than raise/flat

  const pctLabel = (p) => `top ${Math.round(p * 100)}%`;

  // input: { hole, position, inPosition, call, bb, effStack }
  function advise(input) {
    const hole = input.hole;
    if (!hole || hole.length !== 2) return null;
    const p = PNO.ranges.handPercentile(hole[0], hole[1]);
    if (p == null) return null;

    const pos = input.position || null;
    const ip = input.inPosition;
    const facing = (Number(input.call) || 0) > 0;
    const bb = Number(input.bb) || 0;
    const effStack = Number(input.effStack) || 0;
    const label = `${pctLabel(p)} hand`;

    // Short-stacked: push or fold (no raise-folding or flatting a raise with ~20bb).
    const stackBB = (bb > 0 && effStack > 0) ? effStack / bb : null;
    const short = stackBB != null && stackBB <= SHORT_STACK_BB;
    const bbTag = stackBB != null ? ` (${Math.round(stackBB)}bb)` : '';
    const shove = effStack > 0
      ? { chips: Math.round(effStack), note: stackBB != null ? `${Math.round(stackBB)}bb shove` : 'all-in' }
      : null;
    const openPct = pos && OPEN_RANGE[pos] != null ? OPEN_RANGE[pos] : DEFAULT_OPEN;

    if (facing) {
      if (short) {
        if (p <= CALL_RAISE) {
          return { action: 'Shove', tone: 'good', size: shove,
            reason: `${label}, short${bbTag} — jam all-in over the raise.` };
        }
        return { action: 'Fold', tone: 'bad', reason: `${label} — too weak to jam${bbTag}.` };
      }
      // Facing a raise (normal stacks).
      if (p <= THREE_BET) {
        const size = bb > 0 ? { chips: Math.round((Number(input.call) || 0) * 3), note: '3-bet' } : null;
        return { action: 'Raise', tone: 'good', size,
          reason: `Premium (${label}) — 3-bet for value.` };
      }
      if (p <= CALL_RAISE) {
        return { action: 'Call', tone: 'good',
          reason: `Strong (${label}) — call the raise${ip === true ? ' in position' : ''}.` };
      }
      return { action: 'Fold', tone: 'bad',
        reason: `${label} — too weak to continue vs. a raise.` };
    }

    // Unraised pot (folded to you, or limpers).
    if (short) {
      if (p <= Math.min(openPct, 0.30)) {
        return { action: 'Shove', tone: 'good', size: shove,
          reason: `${label}, short${bbTag} — open-jam all-in${pos ? ` from the ${pos.toLowerCase()}` : ''}.` };
      }
      if (pos === 'Big blind') {
        return { action: 'Check', tone: 'neutral', reason: `${label} — check your option${bbTag}.` };
      }
      return { action: 'Fold', tone: 'bad', reason: `${label} — too weak to jam${bbTag}.` };
    }
    if (p <= openPct) {
      const size = bb > 0 ? { chips: Math.round(3 * bb), note: 'open to 3bb' } : null;
      return { action: 'Raise', tone: 'good', size,
        reason: `${label} — open-raise${pos ? ` from the ${pos.toLowerCase()}` : ''}.` };
    }
    if (pos === 'Big blind') {
      return { action: 'Check', tone: 'neutral',
        reason: `${label} — check your option, nothing to call.` };
    }
    return { action: 'Fold', tone: 'bad',
      reason: `${label} — below a ${pos ? pos.toLowerCase() : 'standard'} opening range.` };
  }

  PNO.preflop = { advise, OPEN_RANGE };
})();
