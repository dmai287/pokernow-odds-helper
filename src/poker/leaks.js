// leaks.js — turns logged hands into a leak report: where you make and lose chips,
// and concrete tendencies to fix. Pure function over the hand-history records.
//
// Records store the FINAL state of each hand (most-developed street), plus the chip
// `net` result, so the report reflects how far hands went, your position, the final
// recommended action, and the outcome. Net is a best-effort stack delta — approximate.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const num = (x) => typeof x === 'number' && isFinite(x);

  function group(hands, pred) {
    const hs = hands.filter(pred);
    const wn = hs.filter((h) => num(h.net));
    const net = wn.reduce((s, h) => s + h.net, 0);
    return { hands: hs.length, net, netCount: wn.length, netPerHand: wn.length ? net / wn.length : null };
  }

  function analyze(hands) {
    hands = Array.isArray(hands) ? hands : [];
    const count = hands.length;
    const withNet = hands.filter((h) => num(h.net));
    const netTotal = withNet.reduce((s, h) => s + h.net, 0);

    const report = {
      count,
      hasNet: withNet.length > 0,
      netCount: withNet.length,
      netTotal,
      netPerHand: withNet.length ? netTotal / withNet.length : null,
      byPosition: [],
      ip: group(hands, (h) => h.inPosition === true),
      oop: group(hands, (h) => h.inPosition === false),
      riverRate: count ? hands.filter((h) => h.street === 'river').length / count : 0,
      aggression: null,
      minusEvCalls: { count: 0, evLost: 0 },
      worstHands: [],
      tips: [],
    };
    if (!count) return report;

    // Net by position (sorted worst → best).
    const posMap = {};
    hands.forEach((h) => {
      if (!h.position) return;
      const p = posMap[h.position] || (posMap[h.position] = { position: h.position, hands: 0, net: 0, netCount: 0 });
      p.hands++;
      if (num(h.net)) { p.net += h.net; p.netCount++; }
    });
    report.byPosition = Object.keys(posMap).map((k) => {
      const p = posMap[k];
      return { ...p, netPerHand: p.netCount ? p.net / p.netCount : null };
    }).sort((a, b) => (a.netPerHand ?? 0) - (b.netPerHand ?? 0));

    // Aggression of the final recommended action.
    let agg = 0, pas = 0;
    hands.forEach((h) => {
      const a = h.action || '';
      if (/^(Bet|Raise)/.test(a)) agg++;
      else if (/^(Call|Check)/.test(a)) pas++;
    });
    report.aggression = { aggressive: agg, passive: pas, ratioPct: (agg + pas) ? Math.round(100 * agg / (agg + pas)) : null };

    // −EV calls (a call with negative chip EV).
    hands.forEach((h) => {
      if (/^Call/.test(h.action || '') && num(h.ev) && h.ev < 0) {
        report.minusEvCalls.count++;
        report.minusEvCalls.evLost += h.ev;
      }
    });
    report.minusEvCalls.evLost = Math.round(report.minusEvCalls.evLost);

    // Biggest losing hands, for review.
    report.worstHands = withNet.slice().sort((a, b) => a.net - b.net).slice(0, 3).map((h) => ({
      hero: (h.hero || []).join(' '),
      board: (h.board || []).join(' '),
      position: h.position,
      action: h.action,
      net: Math.round(h.net),
    }));

    buildTips(report);
    return report;
  }

  function buildTips(r) {
    const tips = r.tips;
    if (num(r.oop.netPerHand) && num(r.ip.netPerHand) && r.oop.netPerHand < r.ip.netPerHand && r.oop.net < 0) {
      tips.push(`You lose ~${Math.abs(Math.round(r.oop.netPerHand))}/hand out of position vs ${r.ip.netPerHand >= 0 ? '+' : ''}${Math.round(r.ip.netPerHand)}/hand in position — tighten your out-of-position continuing range.`);
    }
    if (r.riverRate > 0.4 && r.netTotal < 0) {
      tips.push(`You reach the river in ${Math.round(r.riverRate * 100)}% of hands while net-negative — you may be calling down too light. Fold more rivers without a strong hand.`);
    }
    if (r.aggression.ratioPct != null && r.aggression.aggressive + r.aggression.passive >= 5 && r.aggression.ratioPct < 30) {
      tips.push(`Only ${r.aggression.ratioPct}% of your final actions are bets/raises — you're playing too passively. Look for value bets and semi-bluffs.`);
    }
    if (r.minusEvCalls.count > 0) {
      tips.push(`${r.minusEvCalls.count} −EV call${r.minusEvCalls.count > 1 ? 's' : ''} cost ~${Math.abs(r.minusEvCalls.evLost)} chips — the pot odds didn't justify them; fold those spots.`);
    }
    const worstPos = r.byPosition.find((p) => num(p.netPerHand) && p.netPerHand < 0 && p.netCount >= 2);
    if (worstPos) {
      tips.push(`Your worst seat is the ${worstPos.position.toLowerCase()} (${Math.round(worstPos.netPerHand)}/hand over ${worstPos.netCount} hands) — play tighter there.`);
    }
    if (!tips.length) {
      tips.push('No major leaks detected yet — keep logging hands for a sharper read.');
    }
  }

  PNO.leaks = { analyze };
})();
