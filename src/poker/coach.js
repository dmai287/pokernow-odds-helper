// coach.js — learns YOUR tendencies from the hand history (via the leak report) and
// surfaces a context-relevant nudge during live play. This coaches the hero on their
// own leaks; it does not profile opponents.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const MIN_HANDS = 15; // need a sample before the read is meaningful

  // Build a tendency profile from logged hands.
  function profile(hands) {
    const r = PNO.leaks ? PNO.leaks.analyze(hands) : null;
    if (!r || r.count < MIN_HANDS) return { ready: false, count: r ? r.count : 0 };

    const oop = r.oop, ip = r.ip;
    const leaksOOP =
      typeof oop.netPerHand === 'number' && typeof ip.netPerHand === 'number' &&
      oop.netPerHand < ip.netPerHand && oop.net < 0;

    return {
      ready: true,
      count: r.count,
      overCallsRiver: r.riverRate > 0.4 && r.netTotal < 0,
      tooPassive: r.aggression.ratioPct != null && r.aggression.ratioPct < 30,
      leaksOOP,
      oopPerHand: oop.netPerHand,
      aggressionPct: r.aggression.ratioPct,
      riverRatePct: Math.round(r.riverRate * 100),
    };
  }

  // Given the current spot, return a single most-relevant coaching note, or null.
  // ctx: { street, inPosition, action, facingBet }
  function note(p, ctx) {
    if (!p || !p.ready || !ctx) return null;
    const a = ctx.action || '';
    const isCall = /^Call/.test(a);
    const isCheck = /^Check/.test(a);

    if (ctx.street === 'river' && isCall && p.overCallsRiver) {
      return `Your leak: you over-call rivers (${p.riverRatePct}% reach showdown, net −). Make sure this beats a bluff.`;
    }
    if (ctx.inPosition === false && (isCall || isCheck) && p.leaksOOP) {
      return `You lose ~${Math.abs(Math.round(p.oopPerHand))}/hand out of position — lean toward folding marginal spots.`;
    }
    if (isCheck && p.tooPassive) {
      return `You play passively (${p.aggressionPct}% aggression) — look for a bet or semi-bluff here.`;
    }
    return null;
  }

  PNO.coach = { profile, note, MIN_HANDS };
})();
