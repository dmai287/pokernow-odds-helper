// sim.js — UI for the practice simulator. Drives the engine, renders the table, wires
// the hero's controls, shows learning advice, and displays bot profiles.
(function () {
  const S = PNO.sim, B = PNO.bots;
  const $ = (id) => document.getElementById(id);
  let game = null;

  const RED = (c) => c.suit === 1 || c.suit === 2;
  function cardHTML(card, faceUp) {
    if (!card) return '<span class="pcard empty"></span>';
    if (!faceUp) return '<span class="pcard back"></span>';
    return `<span class="pcard ${RED(card) ? 'red' : ''}">${PNO.cards.cardToStr(card)}</span>`;
  }

  function newGame() {
    const numBots = parseInt($('numBots').value, 10) || 3;
    const styles = pickStyles(numBots);
    game = S.createGame({ numBots, startingStack: 1000, sb: 10, bb: 20, botStyles: styles });
    nextHand();
  }

  // Pick a varied set of styles.
  function pickStyles(n) {
    const pool = B.STYLES.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    const out = [];
    for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
    return out;
  }

  function nextHand() {
    S.startHand(game);
    if (game.phase !== 'gameover') S.advance(game);
    render();
  }

  function heroAct(action) {
    S.heroAct(game, action);
    render();
  }

  // ---- rendering ----
  function render() {
    renderOpponents();
    renderMiddle();
    renderHero();
    renderControls();
    renderAdvice();
    renderStats();
    renderLog();
  }

  function seatHTML(p, idx, faceUp) {
    const isButton = idx === game.buttonIdx;
    const cls = ['seat'];
    if (p.folded) cls.push('folded');
    if (idx === game.toAct) cls.push('active');
    const cards = p.hole.length
      ? p.hole.map((c) => cardHTML(c, faceUp)).join('')
      : cardHTML(null) + cardHTML(null);
    return `<div class="${cls.join(' ')}">
      <div class="seat-name">${esc(p.name)}${isButton ? ' <span class="btn-chip">D</span>' : ''}</div>
      ${p.style ? `<div class="seat-tag">${esc(p.style.tag)}</div>` : ''}
      <div class="seat-cards">${cards}</div>
      <div class="seat-stack">${p.stack.toLocaleString()}</div>
      <div class="seat-action">${p.streetBet ? '<span class="bet">' + p.streetBet + '</span>' : ''} ${esc(p.lastAction || '')}</div>
    </div>`;
  }

  function renderOpponents() {
    const reveal = game.results && game.results.reveal ? game.results.reveal : [];
    const html = game.players.map((p, i) => i).filter((i) => !game.players[i].isHero)
      .map((i) => seatHTML(game.players[i], i, reveal.indexOf(i) !== -1)).join('');
    $('opponents').innerHTML = html;
  }

  function renderMiddle() {
    const slots = [];
    for (let i = 0; i < 5; i++) slots.push(cardHTML(game.board[i], true));
    $('board').innerHTML = slots.join('');
    $('pot').innerHTML = `Pot <strong>${S.pot(game).toLocaleString()}</strong>`;
    if (game.phase === 'handover' && game.results) {
      $('result').innerHTML = game.results.awards
        .map((a) => `${esc(a.winners.join(', '))} win ${a.amount.toLocaleString()}`).join(' · ');
    } else if (game.phase === 'gameover') {
      $('result').textContent = 'Game over — start a new game.';
    } else {
      $('result').textContent = '';
    }
  }

  function renderHero() {
    const hero = game.players[0];
    $('hero').innerHTML = seatHTML(hero, 0, true);
  }

  function renderControls() {
    const el = $('controls');
    if (game.phase === 'gameover') {
      el.innerHTML = '<button class="btn big" id="ng2">New game</button>';
      $('ng2').onclick = newGame;
      return;
    }
    if (game.phase === 'handover') {
      el.innerHTML = '<button class="btn big" id="nh">Next hand →</button>';
      $('nh').onclick = nextHand;
      return;
    }
    const la = S.legalActions(game);
    if (!la || !game.players[la.idx].isHero) { el.innerHTML = ''; return; }

    const potAfter = la.pot + la.toCall;
    const presets = [
      { label: 'Min', to: la.minRaiseTo },
      { label: '½ Pot', to: Math.round(game.currentBet + 0.5 * potAfter) },
      { label: 'Pot', to: Math.round(game.currentBet + potAfter) },
      { label: 'All-in', to: la.maxRaiseTo },
    ].map((x) => ({ ...x, to: Math.max(la.minRaiseTo, Math.min(la.maxRaiseTo, x.to)) }));

    const verb = game.currentBet > 0 ? 'Raise to' : 'Bet';
    el.innerHTML =
      `<div class="btn-row">` +
        (la.toCall > 0 ? `<button class="btn act-fold" id="fold">Fold</button>` : '') +
        (la.canCheck ? `<button class="btn act-call" id="check">Check</button>`
                     : `<button class="btn act-call" id="call">Call ${la.toCall.toLocaleString()}</button>`) +
        (la.canRaise ? `<button class="btn act-raise" id="raise">${verb} <span id="raiseAmt">${presets[1].to.toLocaleString()}</span></button>` : '') +
      `</div>` +
      (la.canRaise ? `<div class="size-row">${presets.map((p, k) => `<button class="chip" data-to="${p.to}">${p.label}</button>`).join('')}
         <input type="range" id="raiseSlider" min="${la.minRaiseTo}" max="${la.maxRaiseTo}" value="${presets[1].to}"></div>` : '');

    if ($('fold')) $('fold').onclick = () => heroAct({ type: 'fold' });
    if ($('check')) $('check').onclick = () => heroAct({ type: 'check' });
    if ($('call')) $('call').onclick = () => heroAct({ type: 'call' });
    if (la.canRaise) {
      let target = presets[1].to;
      const setTarget = (v) => {
        target = Math.max(la.minRaiseTo, Math.min(la.maxRaiseTo, v));
        $('raiseAmt').textContent = target.toLocaleString();
        $('raiseSlider').value = target;
      };
      $('raiseSlider').oninput = (e) => setTarget(parseInt(e.target.value, 10));
      [...el.querySelectorAll('.chip')].forEach((c) => { c.onclick = () => setTarget(parseInt(c.dataset.to, 10)); });
      $('raise').onclick = () => heroAct({ type: game.currentBet > 0 ? 'raise' : 'bet', amount: target });
    }
  }

  function renderAdvice() {
    const el = $('advice');
    if (!$('showAdvice').checked || game.phase === 'handover' || game.phase === 'gameover') { el.innerHTML = ''; return; }
    const la = S.legalActions(game);
    if (!la || !game.players[la.idx].isHero) { el.innerHTML = ''; return; }
    const hero = game.players[0];
    const opp = Math.max(1, S.liveIdxs(game).length - 1);
    const res = PNO.equity.monteCarlo(hero.hole, game.board, opp, 1500, null);
    const eq = res ? res.equity : null;
    let decision;
    if (game.board.length === 0) {
      decision = PNO.preflop.advise({ hole: hero.hole, position: null, call: la.toCall, bb: game.bb });
    } else {
      const draws = PNO.draws.analyze(hero.hole, game.board);
      decision = eq != null ? PNO.decision.decide({
        equity: eq, pot: la.pot, call: la.toCall, opponents: opp,
        outs: draws ? draws.outs : 0, effStack: Math.max(0, hero.stack - la.toCall),
      }) : null;
    }
    const act = decision ? decision.action + (decision.size && decision.size.chips > 0 ? ' → ' + decision.size.chips : '') : '—';
    el.innerHTML = `<span class="adv-label">Advice</span> <strong>${esc(act)}</strong>` +
      (eq != null ? ` <span class="adv-eq">${(eq * 100).toFixed(1)}% equity</span>` : '') +
      (decision ? `<div class="adv-reason">${esc(decision.reason)}</div>` : '');
  }

  function renderStats() {
    const rows = game.players.filter((p) => !p.isHero).map((p) => {
      const s = p.stats;
      const pctOf = (x) => s.hands ? Math.round(100 * x / s.hands) + '%' : '—';
      const af = s.calls ? (s.betsRaises / s.calls).toFixed(1) : (s.betsRaises ? '∞' : '—');
      const net = s.net;
      return `<tr><td>${esc(p.name)}</td><td>${s.hands}</td><td>${pctOf(s.vpip)}</td><td>${pctOf(s.pfr)}</td>` +
        `<td>${af}</td><td>${pctOf(s.wtsd)}</td><td class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${net.toLocaleString()}</td></tr>`;
    }).join('');
    $('stats').innerHTML =
      `<table class="stats"><thead><tr><th>Bot</th><th>Hands</th><th>VPIP</th><th>PFR</th><th>AF</th><th>WTSD</th><th>Net</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="stats-note">VPIP = voluntarily played · PFR = preflop raise · AF = aggression factor · WTSD = went to showdown</p>`;
  }

  function renderLog() {
    $('log').innerHTML = game.log.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join('');
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  $('newGame').onclick = newGame;
  $('showAdvice').onchange = render;
  newGame();
})();
