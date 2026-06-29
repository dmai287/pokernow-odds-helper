// enemies.js — infers a simple opponent profile from observed hand history and the
// current live spot, so the extension can describe how a villain tends to play.
(function (root, factory) {
  const PNO = (root.PNO = root.PNO || {});
  const api = factory();
  PNO.enemies = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const num = (x) => typeof x === 'number' && isFinite(x);

  function parseRangePercent(value) {
    if (value == null) return null;
    const s = String(value).toLowerCase();
    const m = s.match(/top\s*(\d+(?:\.\d+)?)\s*%/);
    if (m) return Math.min(1, Math.max(0, parseFloat(m[1]) / 100));
    if (/any\s*two|any/i.test(s)) return 1;
    return null;
  }

  function actionScore(action) {
    const a = String(action || '').toLowerCase();
    if (/raise/.test(a)) return 1;
    if (/bet/.test(a)) return 0.9;
    if (/call/.test(a)) return 0.4;
    if (/check/.test(a)) return 0.1;
    return 0.5;
  }

  function summarizeStyle(avgTight, avgAgg) {
    if (avgAgg >= 0.75 && avgTight <= 0.25) return 'tight-aggressive';
    if (avgAgg >= 0.7) return 'loose-aggressive';
    if (avgTight <= 0.25) return 'tight-passive';
    if (avgAgg <= 0.3) return 'loose-passive';
    return 'balanced';
  }

  function describeStyle(style, avgTight, avgAgg) {
    switch (style) {
      case 'tight-aggressive':
        return 'They play a small range but get aggressive when they enter the pot.';
      case 'loose-aggressive':
        return 'They play lots of hands and like to pressure the action.';
      case 'tight-passive':
        return 'They are selective and do not fight back much.';
      case 'loose-passive':
        return 'They call too much and do not raise often.';
      default:
        return `They show a mixed style and usually play around a ${Math.round(avgTight * 100)}% range.`;
    }
  }

  function buildStrategy(style, stats, spot) {
    const multiway = spot && spot.opponents && spot.opponents > 2;
    const vpip = stats && stats.vpip != null ? stats.vpip : 0;
    const pfr = stats && stats.pfr != null ? stats.pfr : 0;
    const threeBet = stats && stats.threeBet != null ? stats.threeBet : 0;
    const af = stats && stats.af != null ? stats.af : 0;

    if (vpip >= 40 && pfr <= 10) {
      return 'They play too many hands, so play tighter preflop and value bet strong hands when they call.';
    }
    if (vpip <= 20 && pfr >= 15 && threeBet >= 5) {
      return 'They are tight and aggressive, so fold weak hands and let them bluff into your strong range.';
    }
    if (vpip >= 35 && pfr >= 15 && af >= 3) {
      return 'They are loose and aggressive, so call with strong hands and punish their bluffs.';
    }
    if (vpip <= 20 && pfr <= 10 && af <= 2) {
      return 'They are passive, so bet more often and bluff a little more when they fold too easily.';
    }

    switch (style) {
      case 'tight-aggressive':
        return multiway
          ? 'Play tighter preflop, value bet strong hands, and avoid bluffing into their raises.'
          : 'Bet for value with strong hands and let them bluff into you.';
      case 'loose-aggressive':
        return 'Call more often with strong hands, raise for value, and punish their bluffs.';
      case 'tight-passive':
        return 'Bet more often and bluff a bit more; they fold too easily.';
      case 'loose-passive':
        return 'Value bet thinner, isolate them when they call too much, and avoid over-bluffing.';
      default:
        return 'Play straightforwardly: bet strong hands, fold the weak ones, and avoid big river calls.';
    }
  }

  function pct(count, total) {
    return total ? Math.round((count / total) * 100) : 0;
  }

  function profile(hands, spot) {
    const records = Array.isArray(hands) ? hands.filter(Boolean) : [];
    if (!records.length) {
      return {
        ready: false,
        count: 0,
        style: 'unknown',
        notes: ['No opponent history yet — collect a few hands to build a profile.'],
      };
    }

    let tightnessSum = 0;
    let aggressionSum = 0;
    let vpipCount = 0;
    let pfrCount = 0;
    let threeBetCount = 0;
    let raises = 0;
    let calls = 0;
    let checks = 0;

    records.forEach((h) => {
      const tight = parseRangePercent(h.range || h.rangeLabel || h.range || null);
      const action = String(h.action || h.lastAction || '').toLowerCase();
      const street = String(h.street || '').toLowerCase();
      const preflop = street === 'preflop' || street === '';
      if (num(tight)) tightnessSum += tight;
      aggressionSum += actionScore(h.action || h.lastAction || '');
      if (preflop && /(raise|call|bet)/.test(action)) vpipCount++;
      if (preflop && /(raise|bet)/.test(action)) pfrCount++;
      if (preflop && /raise/.test(action)) threeBetCount++;
      if (/raise/i.test(h.action || h.lastAction || '')) raises++;
      if (/call/i.test(h.action || h.lastAction || '')) calls++;
      if (/check/i.test(h.action || h.lastAction || '')) checks++;
    });

    const avgTight = tightnessSum / records.length;
    const avgAgg = aggressionSum / records.length;
    const style = summarizeStyle(avgTight, avgAgg);
    const notes = [describeStyle(style, avgTight, avgAgg)];
    const stats = {
      vpip: pct(vpipCount, records.length),
      pfr: pct(pfrCount, records.length),
      threeBet: pct(threeBetCount, records.length),
      af: Math.max(0.1, Math.round((avgAgg + 0.2) * 10) / 10),
    };

    const strategy = buildStrategy(style, stats, spot);

    const currentRange = parseRangePercent(spot && (spot.rangeLabel || spot.range || null));
    const currentAction = spot && spot.action;
    const multiway = spot && spot.opponents && spot.opponents > 2;

    if (currentRange != null) {
      notes.push(`Right now the spot looks like a top ${Math.round(currentRange * 100)}% range.`);
    }
    if (currentAction) {
      notes.push(`The current action is ${currentAction.toLowerCase()} — that is a good clue for how they will continue.`);
    }
    if (multiway) {
      notes.push('This hand is multiway, so they may call more often than they would heads-up.');
    }
    if (raises >= 2 && calls <= 1) {
      notes.push('They raise more often than they call, so keep them honest with strong hands.');
    }
    if (checks > raises && avgAgg < 0.35) {
      notes.push('They seem passive and may fold too often when you pressure them.');
    }

    return {
      ready: true,
      count: records.length,
      style,
      avgTight,
      avgAgg,
      notes,
      strategy,
      stats,
      tightnessPct: Math.round(avgTight * 100),
      aggressionPct: Math.round(avgAgg * 100),
      sample: records.slice(-5).map((h) => ({ action: h.action, range: h.range || h.rangeLabel || null })),
    };
  }

  return { profile };
});
