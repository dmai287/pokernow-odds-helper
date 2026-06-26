// engine.js — a self-contained No-Limit Hold'em engine for the practice simulator.
// Pure logic (no DOM): deals hands, runs betting rounds, resolves showdowns with
// correct side pots, and tracks per-bot stats. Bots are code (see bots.js) — this is a
// sandbox for practising against AI, not a live table.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const evaluate = PNO.evaluator.evaluate;

  function freshDeck() {
    const d = [];
    for (let r = 2; r <= 14; r++) for (let s = 0; s < 4; s++) d.push({ rank: r, suit: s });
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = d[i]; d[i] = d[j]; d[j] = t;
    }
    return d;
  }

  const emptyStats = () => ({ hands: 0, vpip: 0, pfr: 0, betsRaises: 0, calls: 0, wtsd: 0, won: 0, net: 0 });

  function createGame(opts) {
    opts = opts || {};
    const stack = opts.startingStack || 1000;
    const sb = opts.sb || 10, bb = opts.bb || 20;
    const styles = opts.botStyles || [];
    const players = [mkPlayer('You', true, null, stack)];
    styles.forEach((st) => players.push(mkPlayer(st.name, false, st, stack)));
    return {
      players, buttonIdx: -1, sb, bb,
      deck: [], board: [], currentBet: 0, lastRaiseSize: bb,
      toAct: -1, phase: 'idle', log: [], results: null, handNo: 0,
    };
  }

  function mkPlayer(name, isHero, style, stack) {
    return {
      name, isHero, style, stack, hole: [], contributed: 0, streetBet: 0,
      folded: false, allIn: false, acted: false, lastAction: null,
      _vpip: false, _pfr: false, _stackStart: stack, stats: emptyStats(),
    };
  }

  const inGame = (g) => g.players.map((p, i) => i).filter((i) => g.players[i].stack > 0 || g.players[i].contributed > 0);
  const liveIdxs = (g) => g.players.map((p, i) => i).filter((i) => !g.players[i].folded);
  const pot = (g) => g.players.reduce((s, p) => s + p.contributed, 0);

  function nextWithChips(g, from) {
    const n = g.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (g.players[i].stack > 0) return i;
    }
    return from;
  }

  function commit(g, i, amount) {
    const p = g.players[i];
    const amt = Math.min(amount, p.stack);
    p.stack -= amt; p.streetBet += amt; p.contributed += amt;
    if (p.stack === 0) p.allIn = true;
    return amt;
  }

  function startHand(g) {
    const seats = g.players.map((p, i) => i).filter((i) => g.players[i].stack > 0);
    if (seats.length < 2) { g.phase = 'gameover'; g.toAct = -1; return g; }

    g.deck = freshDeck();
    g.board = [];
    g.currentBet = 0;
    g.lastRaiseSize = g.bb;
    g.log = [];
    g.results = null;
    g.phase = 'preflop';
    g.handNo++;
    g.players.forEach((p) => {
      p.hole = []; p.contributed = 0; p.streetBet = 0; p.allIn = false; p.acted = false;
      p.lastAction = null; p._vpip = false; p._pfr = false;
      p.folded = p.stack <= 0; p._stackStart = p.stack;
    });

    g.buttonIdx = g.buttonIdx < 0 ? seats[0] : nextWithChips(g, g.buttonIdx);

    let sbIdx, bbIdx, first;
    if (seats.length === 2) {
      sbIdx = g.buttonIdx; bbIdx = nextWithChips(g, g.buttonIdx); first = sbIdx;
    } else {
      sbIdx = nextWithChips(g, g.buttonIdx); bbIdx = nextWithChips(g, sbIdx); first = nextWithChips(g, bbIdx);
    }
    commit(g, sbIdx, g.sb); g.players[sbIdx].lastAction = 'SB';
    commit(g, bbIdx, g.bb); g.players[bbIdx].lastAction = 'BB';
    g.currentBet = g.bb;

    g.players.forEach((p, i) => { if (!p.folded) p.hole = [g.deck.pop(), g.deck.pop()]; });
    g.players.forEach((p) => { if (!p.folded) p.stats.hands++; });

    g.toAct = canAct(g, first) ? first : findNextActor(g, first);
    log(g, `Hand #${g.handNo} — blinds ${g.sb}/${g.bb}`);
    return g;
  }

  const canAct = (g, i) => { const p = g.players[i]; return !p.folded && !p.allIn; };

  // Next player who still needs to act, scanning clockwise from `fromIdx`. Returns -1
  // when the betting round is closed.
  function findNextActor(g, fromIdx) {
    const n = g.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (fromIdx + k) % n;
      const p = g.players[i];
      if (p.folded || p.allIn) continue;
      if (!p.acted || p.streetBet < g.currentBet) return i;
    }
    return -1;
  }

  function applyAction(g, i, action) {
    const p = g.players[i];
    const toCall = g.currentBet - p.streetBet;
    if (action.type === 'fold') {
      p.folded = true; p.lastAction = 'Fold';
    } else if (action.type === 'check') {
      p.lastAction = 'Check';
    } else if (action.type === 'call') {
      const amt = commit(g, i, toCall);
      p.lastAction = p.allIn ? 'All-in (call)' : 'Call ' + amt;
      if (g.phase === 'preflop' && amt > 0) p._vpip = true;
      else if (g.phase !== 'preflop') p.stats.calls++;
    } else { // bet / raise / all-in (action.amount = target streetBet)
      let target = action.type === 'allin' ? p.streetBet + p.stack : action.amount;
      target = Math.min(target, p.streetBet + p.stack);
      const raiseOver = target - g.currentBet;
      commit(g, i, target - p.streetBet);
      if (p.streetBet > g.currentBet) {
        g.lastRaiseSize = Math.max(g.bb, raiseOver);
        g.currentBet = p.streetBet;
        g.players.forEach((q, qi) => { if (qi !== i && !q.folded && !q.allIn) q.acted = false; });
      }
      p.lastAction = (g.currentBet > toCall + p.streetBet - (target - p.streetBet) ? 'Raise' : 'Bet') + ' ' + target;
      p.lastAction = (action.type === 'bet' ? 'Bet ' : 'Raise to ') + target + (p.allIn ? ' (all-in)' : '');
      if (g.phase === 'preflop') { p._vpip = true; p._pfr = true; }
      else p.stats.betsRaises++;
    }
    p.acted = true;
    log(g, `${p.name}: ${p.lastAction}`);
  }

  function progressStreet(g) {
    g.players.forEach((p) => { p.streetBet = 0; if (!p.folded && !p.allIn) p.acted = false; });
    g.currentBet = 0; g.lastRaiseSize = g.bb;
    if (g.phase === 'preflop') { g.board.push(g.deck.pop(), g.deck.pop(), g.deck.pop()); g.phase = 'flop'; }
    else if (g.phase === 'flop') { g.board.push(g.deck.pop()); g.phase = 'turn'; }
    else if (g.phase === 'turn') { g.board.push(g.deck.pop()); g.phase = 'river'; }
    g.toAct = findNextActor(g, g.buttonIdx);
  }

  // Run the hand forward (bots act automatically) until it's the hero's turn or the
  // hand is over. Returns the game.
  function advance(g) {
    let guard = 0;
    while (guard++ < 5000) {
      if (liveIdxs(g).length === 1) { finishHand(g); return g; }
      if (g.toAct < 0) {
        if (g.phase === 'river') { finishHand(g); return g; }
        // If at most one player can still act, no betting remains — run the board out.
        if (g.players.filter((p) => !p.folded && !p.allIn).length <= 1) {
          while (g.phase !== 'river') progressStreet(g);
          finishHand(g); return g;
        }
        progressStreet(g);
        continue;
      }
      const p = g.players[g.toAct];
      if (p.isHero) return g; // wait for the human
      const action = PNO.bots.decide(g, g.toAct);
      applyAction(g, g.toAct, action);
      g.toAct = findNextActor(g, g.toAct);
    }
    return g;
  }

  function heroAct(g, action) {
    if (g.toAct < 0 || !g.players[g.toAct].isHero) return g;
    applyAction(g, g.toAct, action);
    g.toAct = findNextActor(g, g.toAct);
    return advance(g);
  }

  function finishHand(g) {
    const live = liveIdxs(g);
    if (live.length > 1) { while (g.board.length < 5) g.board.push(g.deck.pop()); }

    const awards = awardPots(g);
    // stats: showdown + wins + net
    const winners = new Set();
    awards.forEach((a) => a.winners.forEach((w) => winners.add(w)));
    g.players.forEach((p, i) => {
      if (p.folded && p._stackStart === p.stack && p.contributed === 0) { /* not dealt */ }
      if (p._vpip) p.stats.vpip++;
      if (p._pfr) p.stats.pfr++;
      if (live.length > 1 && !p.folded) p.stats.wtsd++;
      if (winners.has(i)) p.stats.won++;
      p.stats.net += p.stack - p._stackStart;
    });

    g.results = {
      board: g.board.slice(),
      awards: awards.map((a) => ({
        amount: a.amount,
        winners: a.winners.map((w) => g.players[w].name),
        winnerIdxs: a.winners.slice(),
      })),
      showdown: live.length > 1,
      reveal: live.length > 1 ? live.slice() : [],
    };
    g.phase = 'handover';
    g.toAct = -1;
    log(g, g.results.awards.map((a) => `${a.winners.join(', ')} win ${a.amount}`).join(' · '));
  }

  // Build side pots from contributions and award each to the best eligible hand.
  function awardPots(g) {
    const ps = g.players.map((p, i) => ({ idx: i, c: p.contributed, folded: p.folded }));
    const pots = [];
    while (true) {
      const positive = ps.filter((x) => x.c > 0);
      if (!positive.length) break;
      const min = Math.min.apply(null, positive.map((x) => x.c));
      let amount = 0; const eligible = [];
      ps.forEach((x) => {
        if (x.c > 0) { x.c -= min; amount += min; if (!x.folded) eligible.push(x.idx); }
      });
      if (amount > 0) pots.push({ amount, eligible });
    }
    const awards = [];
    pots.forEach((layer) => {
      if (!layer.eligible.length) return;
      let best = -1, winners = [];
      layer.eligible.forEach((i) => {
        const sc = evaluate(g.players[i].hole.concat(g.board));
        if (sc > best) { best = sc; winners = [i]; }
        else if (sc === best) winners.push(i);
      });
      const share = Math.floor(layer.amount / winners.length);
      const rem = layer.amount - share * winners.length;
      winners.forEach((i, k) => { g.players[i].stack += share + (k < rem ? 1 : 0); });
      awards.push({ amount: layer.amount, winners, score: best });
    });
    return awards;
  }

  function log(g, msg) { g.log.push(msg); if (g.log.length > 40) g.log.shift(); }

  // Legal actions for the player to act (used by the UI for the hero).
  function legalActions(g) {
    const i = g.toAct;
    if (i < 0) return null;
    const p = g.players[i];
    const toCall = g.currentBet - p.streetBet;
    const minRaiseTo = g.currentBet + g.lastRaiseSize;
    return {
      idx: i,
      toCall: Math.min(toCall, p.stack),
      canCheck: toCall === 0,
      canCall: toCall > 0 && p.stack > 0,
      canRaise: p.stack > toCall,
      minRaiseTo: Math.min(p.streetBet + p.stack, minRaiseTo),
      maxRaiseTo: p.streetBet + p.stack,
      pot: pot(g),
    };
  }

  PNO.sim = { createGame, startHand, advance, heroAct, legalActions, applyAction, findNextActor, awardPots, pot, liveIdxs };
})();
