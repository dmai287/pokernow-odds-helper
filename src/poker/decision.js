// decision.js — turns equity + pot odds (+ position, implied odds, fold equity, and
// stack depth / SPR) into a suggested action. A heuristic for studying decisions — treat
// it as a sanity check on the math, not gospel. It does not model opponent-specific reads.
(function () {
  const PNO = (window.PNO = window.PNO || {});

  const pct = (x) => (x * 100).toFixed(1) + '%';

  // Bet sizing (no bet to call): fraction of the pot, bigger with more equity. Clamped
  // to your remaining stack; at low SPR with a value hand, just get it all in.
  function betSize(equity, pot, stack, spr) {
    if (!(pot > 0)) return null;
    let frac, note;
    if (equity >= 0.75) { frac = 0.75; note = '≈¾ pot'; }
    else if (equity >= 0.60) { frac = 0.66; note = '≈⅔ pot'; }
    else { frac = 0.45; note = '≈½ pot'; }
    let chips = Math.round(frac * pot);
    if (stack != null && stack > 0) {
      if (equity >= VALUE_BET && spr != null && spr <= LOW_SPR) { chips = stack; note = 'all-in · low SPR'; }
      else if (chips >= stack) { chips = stack; note = 'all-in'; }
    }
    return { chips, note };
  }

  // Fold equity a bet needs to break even as a pure bluff: bet / (pot + bet). With a
  // draw as backup the real requirement is lower, but this is the standard reference.
  function requiredFoldEquity(bet, pot) {
    bet = Number(bet) || 0;
    pot = Number(pot) || 0;
    return bet > 0 ? bet / (pot + bet) : null;
  }

  // Implied odds: extra chips you must win on later streets to justify a call that is
  // −EV right now. Returns that amount if it's realistically winnable (within the stack
  // behind), else null. Only meaningful with a real draw (outs) and chips behind.
  function impliedExtra(equity, pot, call, outs, effStack) {
    if (!(outs > 0) || !(effStack > 0) || !(equity > 0)) return null;
    const extra = call * (1 - equity) / equity - pot; // break-even implied winnings
    if (extra <= 0) return 0; // immediate odds already enough
    return extra <= effStack * IMPLIED_REALIZE ? extra : null;
  }

  // Raise sizing (facing a bet): total chips to commit = call + a raise increment
  // measured against the pot after calling. Pot-sized for the strongest hands. Clamped
  // to your stack; at low SPR, shove (you're committed anyway).
  function raiseSize(equity, pot, call, stack, spr) {
    if (!(pot > 0)) return null;
    const potAfterCall = pot + call;
    const frac = equity >= 0.75 ? 1.0 : 0.66;
    let total = Math.round(call + frac * potAfterCall);
    let note = frac >= 1 ? 'pot-sized raise' : '≈⅔-pot raise';
    if (stack != null && stack > 0) {
      if (spr != null && spr <= LOW_SPR) { total = stack; note = 'all-in · low SPR'; }
      else if (total >= stack) { total = stack; note = 'all-in'; }
    }
    return { chips: total, note };
  }

  // Absolute-equity thresholds for raising/betting for value.
  const VALUE_RAISE = 0.66;   // strong favorite → raise when facing a bet
  const VALUE_BET = 0.60;     // good favorite → bet when checked to
  const THIN_BET = 0.50;      // marginal → still worth a bet vs one opponent
  const RAISE_MARGIN = 0.15;  // equity must clear pot odds by this much to raise
  const CLOSE_FOLD = 0.05;    // within this of pot odds = a "close" fold
  const POS_CUSHION = 0.03;   // equity realization: out of position needs a bit more
  const IMPLIED_REALIZE = 0.5; // fraction of the stack behind you realistically win on a hit
  const SEMIBLUFF_OUTS = 8;    // a strong draw (flush draw / open-ender) worth betting
  const LOW_SPR = 2.5;         // stack-to-pot ratio at/below which a value hand commits

  // input: { equity, pot, call, opponents, inPosition, outs, effStack }
  //   inPosition: true (acts last), false (out of position), or undefined (unknown)
  //   outs/effStack: draw outs and the stack behind, for implied-odds on a −EV draw
  // returns: { action, tone: 'good'|'neutral'|'bad', reason }
  function decide(input) {
    const equity = input.equity;
    const pot = Number(input.pot) || 0;
    const call = Number(input.call) || 0;
    const heads = (input.opponents || 1) <= 1;
    const ip = input.inPosition; // true / false / undefined
    const outs = Number(input.outs) || 0;
    const effStack = Number(input.effStack) || 0;
    const posTag = ip === true ? ' (in position)' : ip === false ? ' (out of position)' : '';

    // Stack depth (only when the stack is known). stack = chips you can still put in;
    // spr = stack-to-pot ratio, which decides whether a value hand is committed.
    const haveStack = effStack > 0;
    const stack = haveStack ? effStack + call : null;
    const spr = (haveStack && pot > 0) ? stack / pot : null;
    const sprTag = spr != null && spr <= LOW_SPR ? ` · low SPR ${spr.toFixed(1)}` : '';

    if (equity == null) {
      return { action: '—', tone: 'neutral', reason: 'Enter your hole cards.' };
    }

    // No bet to call: choose between betting/checking. In position you can bet thinner.
    if (call <= 0) {
      if (equity >= VALUE_BET) {
        const size = betSize(equity, pot, stack, spr);
        return { action: 'Bet', tone: 'good', size,
          reason: `Strong equity (${pct(equity)})${posTag}${sprTag} — bet for value${size ? ` (${size.note})` : ''}.` };
      }
      // Strong draw but not enough to value bet: semi-bluff — fold equity now plus the
      // draw as backup beats checking passively.
      if (outs >= SEMIBLUFF_OUTS) {
        let size = pot > 0 ? { chips: Math.round(0.66 * pot), note: '≈⅔ pot' } : null;
        if (size && stack != null && size.chips >= stack) size = { chips: stack, note: 'all-in' };
        const fe = size ? requiredFoldEquity(size.chips, pot) : null;
        return { action: 'Bet (semi-bluff)', tone: 'good', size,
          reason: `${outs} outs + fold equity — semi-bluff${fe != null ? `; needs ~${Math.round(fe * 100)}% folds as a pure bluff (less with your draw)` : ''}.` };
      }
      if ((heads || ip === true) && equity >= THIN_BET) {
        const size = betSize(equity, pot, stack, spr);
        return { action: 'Bet (thin)', tone: 'neutral', size,
          reason: `Slight edge (${pct(equity)})${posTag} — thin value bet${size ? ` (${size.note})` : ''}, or check.` };
      }
      if (equity >= 0.40) {
        return { action: 'Check', tone: 'neutral',
          reason: `Middling equity (${pct(equity)})${posTag} — check and keep the pot small.` };
      }
      return { action: 'Check / give up', tone: 'bad',
        reason: `Weak equity (${pct(equity)}) — check; fold to pressure.` };
    }

    // Facing a bet: compare equity to pot odds, adjusted for position. Out of position
    // you realize less of your equity, so require a small cushion; in position, less.
    const breakeven = call / (pot + call);
    const cushion = ip === true ? -POS_CUSHION : ip === false ? POS_CUSHION : 0;
    const needed = Math.max(0, breakeven + cushion);
    const margin = equity - breakeven;

    if (equity < needed) {
      // −EV right now, but a real draw with chips behind may have the implied odds.
      const extra = impliedExtra(equity, pot, call, outs, effStack);
      if (extra != null) {
        return { action: 'Call (implied)', tone: 'neutral',
          reason: extra <= 0
            ? `Drawing (${outs} outs) — pot odds already cover it.`
            : `−EV now, but your draw (${outs} outs) has implied odds — need to win ~${Math.round(extra)} more on later streets.` };
      }
      if (needed - equity <= CLOSE_FOLD) {
        return { action: 'Fold (close)', tone: 'bad',
          reason: `Just short${posTag} — need ~${pct(needed)} (pot odds ${pct(breakeven)}), ` +
                  `have ${pct(equity)}.` };
      }
      return { action: 'Fold', tone: 'bad',
        reason: `Below pot odds${posTag} — need ${pct(breakeven)}, have ${pct(equity)}.` };
    }

    // Profitable to continue.
    if (equity >= VALUE_RAISE && margin >= RAISE_MARGIN) {
      const size = raiseSize(equity, pot, call, stack, spr);
      return { action: 'Raise', tone: 'good', size,
        reason: `Big edge — ${pct(equity)} vs ${pct(breakeven)} needed${sprTag}. Raise for value${size ? ` (${size.note})` : ''}.` };
    }
    return { action: 'Call', tone: 'good',
      reason: `+EV call${posTag} — ${pct(equity)} vs ${pct(breakeven)} needed.` };
  }

  PNO.decision = { decide, requiredFoldEquity };
})();
