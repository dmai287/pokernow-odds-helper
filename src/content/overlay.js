// overlay.js — builds the draggable on-table panel and exposes a small API.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const { parseCard, cardToStr } = PNO.cards;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function cardInput(placeholder) {
    const i = el('input', 'pno-card');
    i.type = 'text';
    i.maxLength = 3;
    i.placeholder = placeholder;
    i.autocomplete = 'off';
    i.spellcheck = false;
    return i;
  }

  function create() {
    const root = el('div', 'pno-panel');
    root.id = 'pno-panel';

    // Header (drag handle + compact toggle + collapse)
    const header = el('div', 'pno-header');
    header.appendChild(el('span', 'pno-title', '♠ Odds Helper'));
    const headBtns = el('div', 'pno-head-btns');
    const compactBtn = el('button', 'pno-collapse', '⊟');
    compactBtn.title = 'Compact — hide the extra readouts';
    const collapseBtn = el('button', 'pno-collapse', '–');
    headBtns.appendChild(compactBtn);
    headBtns.appendChild(collapseBtn);
    header.appendChild(headBtns);
    root.appendChild(header);

    const body = el('div', 'pno-body');
    root.appendChild(body);

    // Hero cards
    const heroRow = el('div', 'pno-row');
    heroRow.appendChild(el('label', 'pno-label', 'Hand'));
    const hero1 = cardInput('As');
    const hero2 = cardInput('Kd');
    const heroCards = el('div', 'pno-cards');
    heroCards.appendChild(hero1);
    heroCards.appendChild(hero2);
    heroRow.appendChild(heroCards);
    body.appendChild(heroRow);

    // Board cards
    const boardRow = el('div', 'pno-row');
    boardRow.appendChild(el('label', 'pno-label', 'Board'));
    const board = [cardInput('—'), cardInput('—'), cardInput('—'), cardInput('—'), cardInput('—')];
    const boardCards = el('div', 'pno-cards');
    board.forEach((b) => boardCards.appendChild(b));
    boardRow.appendChild(boardCards);
    body.appendChild(boardRow);

    // Opponents
    const oppRow = el('div', 'pno-row');
    oppRow.appendChild(el('label', 'pno-label', 'Opponents'));
    const opp = el('input', 'pno-num');
    opp.type = 'number';
    opp.min = '1';
    opp.max = '9';
    opp.value = '1';
    oppRow.appendChild(opp);
    body.appendChild(oppRow);

    // Pot odds inputs
    const potRow = el('div', 'pno-row');
    potRow.appendChild(el('label', 'pno-label', 'Pot / Call'));
    const pot = el('input', 'pno-num');
    pot.type = 'number'; pot.min = '0'; pot.placeholder = 'pot';
    const call = el('input', 'pno-num');
    call.type = 'number'; call.min = '0'; call.placeholder = 'to call';
    const potWrap = el('div', 'pno-cards');
    potWrap.appendChild(pot);
    potWrap.appendChild(call);
    potRow.appendChild(potWrap);
    body.appendChild(potRow);

    // Results
    const results = el('div', 'pno-results');

    // Position (filled by auto-detect)
    const position = el('div', 'pno-position', '');
    results.appendChild(position);

    // Suggested action (the headline)
    const decisionBox = el('div', 'pno-decision');
    const decisionAction = el('div', 'pno-decision-action', '—');
    const decisionReason = el('div', 'pno-decision-reason', 'Enter your hole cards to get a suggestion.');
    decisionBox.appendChild(decisionAction);
    decisionBox.appendChild(decisionReason);
    results.appendChild(decisionBox);

    const equityLine = el('div', 'pno-equity');
    const equityVal = el('span', 'pno-equity-val', '—');
    equityLine.appendChild(el('span', 'pno-equity-label', 'Equity '));
    equityLine.appendChild(equityVal);
    results.appendChild(equityLine);

    const bar = el('div', 'pno-bar');
    const barFill = el('div', 'pno-bar-fill');
    bar.appendChild(barFill);
    results.appendChild(bar);

    const detail = el('div', 'pno-detail', 'Win — · Tie — · Lose —');
    results.appendChild(detail);

    const ev = el('div', 'pno-ev', '');
    results.appendChild(ev);

    const stack = el('div', 'pno-stack', '');
    stack.style.display = 'none';
    results.appendChild(stack);

    const draws = el('div', 'pno-draws', '');
    results.appendChild(draws);

    const beats = el('div', 'pno-beats', '');
    beats.style.display = 'none';
    results.appendChild(beats);

    const composition = el('div', 'pno-comp', '');
    composition.style.display = 'none';
    results.appendChild(composition);

    const coach = el('div', 'pno-coach', '');
    coach.style.display = 'none';
    results.appendChild(coach);

    const enemy = el('div', 'pno-enemy', '');
    enemy.style.display = 'none';
    const expandedEnemyCards = new Set();
    results.appendChild(enemy);

    body.appendChild(results);

    const note = el('div', 'pno-note', 'Study tool · cards auto-fill from the table when detected');
    body.appendChild(note);

    document.body.appendChild(root);

    // Collapse toggle
    collapseBtn.addEventListener('click', () => {
      const collapsed = root.classList.toggle('pno-collapsed');
      collapseBtn.textContent = collapsed ? '+' : '–';
    });

    // Compact toggle — hide the secondary readouts, keep the decision + equity.
    compactBtn.addEventListener('click', () => {
      const compact = root.classList.toggle('pno-compact');
      compactBtn.textContent = compact ? '⊞' : '⊟';
    });

    // Dragging
    makeDraggable(root, header);

    // Wiring
    const inputs = [hero1, hero2, ...board, opp, pot, call];
    let changeHandler = null;
    inputs.forEach((i) => i.addEventListener('input', () => changeHandler && changeHandler()));

    function getInputs() {
      const heroParsed = [hero1, hero2].map((i) => parseCard(i.value)).filter(Boolean);
      const boardParsed = board.map((i) => parseCard(i.value)).filter(Boolean);
      return {
        hero: heroParsed,
        board: boardParsed,
        opponents: Math.max(1, Math.min(9, parseInt(opp.value, 10) || 1)),
        pot: parseFloat(pot.value) || 0,
        call: parseFloat(call.value) || 0,
      };
    }

    // Fill detected cards without clobbering a field the user is actively editing.
    function setCards(heroCardsArr, boardCardsArr) {
      const fill = (input, card) => {
        if (document.activeElement === input) return;
        const str = card ? cardToStr(card) : '';
        if (input.value.toUpperCase() !== str.toUpperCase()) input.value = str;
      };
      fill(hero1, heroCardsArr[0]);
      fill(hero2, heroCardsArr[1]);
      for (let i = 0; i < 5; i++) fill(board[i], boardCardsArr[i]);
    }

    // Fill detected opponents / pot / call. Skips a field the user is editing, and
    // skips null values (detection unavailable) so manual entry is preserved.
    function setMeta(opponentsVal, potVal, callVal) {
      const fill = (input, val) => {
        if (val == null || document.activeElement === input) return;
        const str = String(val);
        if (input.value !== str) input.value = str;
      };
      fill(opp, opponentsVal);
      fill(pot, potVal);
      fill(call, callVal);
    }

    // Classify the action for an icon + colour, from the action string itself.
    function actionType(action) {
      const a = action || '';
      if (/^Fold/.test(a)) return { type: 'fold', icon: '✋' };
      if (/^(Check|Call)/.test(a)) return { type: 'call', icon: '✓' };
      if (/^(Bet|Raise|Shove)/.test(a)) return { type: 'raise', icon: '⬆' };
      return { type: 'idle', icon: '' };
    }

    function setDecision(decision) {
      const d = decision || { action: '—', tone: 'neutral', reason: '' };
      const at = actionType(d.action);

      // Rebuild the headline: icon · action · sizing badge (DOM nodes, no escaping needed).
      decisionAction.textContent = '';
      if (at.icon) {
        const ic = el('span', 'pno-decision-icon', at.icon);
        decisionAction.appendChild(ic);
      }
      decisionAction.appendChild(document.createTextNode(d.action || '—'));
      if (d.size && d.size.chips > 0) {
        decisionAction.appendChild(el('span', 'pno-decision-size', d.size.chips.toLocaleString()));
      }

      decisionReason.textContent = d.reason;
      decisionBox.className = 'pno-decision pno-' + (d.tone || 'neutral') + ' pno-act-' + at.type;
    }

    // Render stack depth (chips, big blinds, SPR). Pass falsy to clear.
    function setStack(info) {
      if (!info) { stack.textContent = ''; stack.style.display = 'none'; return; }
      const parts = [];
      if (info.chips != null) parts.push(`Stack ${Math.round(info.chips).toLocaleString()}`);
      if (info.bb != null) parts.push(`${Math.round(info.bb)}bb`);
      if (info.spr != null) parts.push(`SPR ${info.spr.toFixed(1)}`);
      stack.textContent = parts.join(' · ');
      stack.className = 'pno-stack' + (info.short ? ' pno-stack-short' : (info.lowSpr ? ' pno-stack-low' : ''));
      stack.style.display = parts.length ? 'block' : 'none';
    }

    // Render expected value of the call. Pass a falsy value to clear.
    function setEV(info) {
      if (!info) {
        ev.textContent = '';
        ev.className = 'pno-ev';
        return;
      }
      const round = (x) => Math.round(x).toLocaleString();
      const sign = info.ev >= 0 ? '+' : '−';
      ev.textContent =
        `Win ${round(info.win)} chips · EV of call ${sign}${round(Math.abs(info.ev))}`;
      ev.className = 'pno-ev ' + (info.ev >= 0 ? 'pno-ev-pos' : 'pno-ev-neg');
    }

    // Render hero position. Pass a falsy value to clear.
    function setPosition(pos) {
      if (!pos || !pos.name) {
        position.textContent = '';
        position.className = 'pno-position';
        return;
      }
      position.textContent = `${pos.name} · ${pos.inPosition ? 'in position' : 'out of position'}`;
      position.className = 'pno-position ' + (pos.inPosition ? 'pno-ip' : 'pno-oop');
    }

    // Render the "what beats you" breakdown (relative hand strength). Pass falsy to clear.
    function setBeats(info) {
      if (!info) { beats.textContent = ''; beats.style.display = 'none'; return; }
      const aheadPct = (info.aheadPct * 100);
      const scope = info.ranged ? 'their range' : 'hands';
      const blockHTML = (info.blocks && info.blocks.length)
        ? `<div class="pno-beats-block">🚫 you block: ${info.blocks.join(', ')}</div>` : '';
      if (aheadPct < 0.05) {
        beats.innerHTML = `<span class="pno-beats-hand">${info.heroCatName}</span> — ` +
          `<span class="pno-beats-nuts">the nuts vs ${scope} ✓</span>` + blockHTML;
      } else {
        const threats = info.categories.slice(0, 3).map((c) => `${c.count} ${c.name}`).join(' · ');
        beats.innerHTML = `<span class="pno-beats-hand">${info.heroCatName}</span> · ` +
          `<span class="pno-beats-threat">${aheadPct.toFixed(1)}% of ${scope} beat you</span>` +
          (threats ? `<div class="pno-beats-list">↑ ${threats}</div>` : '') + blockHTML;
      }
      beats.style.display = 'block';
    }

    // Render the villain's preflop range composition. Pass falsy to clear.
    function setComposition(info) {
      if (!info) { composition.textContent = ''; composition.style.display = 'none'; return; }
      const parts = info.buckets.map((b) => `${Math.round(b.pct * 100)}% ${b.name}`).join(' · ');
      composition.innerHTML = `<span class="pno-comp-label">Their range</span> ${parts}` +
        (info.strongerPct != null
          ? `<div class="pno-comp-dom"><span class="pno-comp-threat">${Math.round(info.strongerPct * 100)}%</span> is a stronger starting hand than yours</div>`
          : '');
      composition.style.display = 'block';
    }

    // Render a coaching nudge (from your own history). Pass falsy to clear.
    function setCoach(text) {
      coach.textContent = text ? '🎯 ' + text : '';
      coach.style.display = text ? 'block' : 'none';
    }

    // Render an opponent profile based on observed tendencies and the current spot.
    function setEnemyProfile(profile) {
      const profiles = Array.isArray(profile) ? profile.filter(Boolean) : (profile ? [profile] : []);
      const readyProfiles = profiles.filter((item) => item && item.ready);
      const hasHistory = profiles.some((item) => item && item.hasHistory);
      if (!readyProfiles.length) {
        if (hasHistory) {
          enemy.innerHTML = `<span class="pno-enemy-label">Enemy profiles</span><div class="pno-enemy-note">Collect a few hands to build profiles for the table.</div>`;
          enemy.style.display = 'block';
        } else {
          enemy.textContent = '';
          enemy.style.display = 'none';
        }
        return;
      }
      const head = `<span class="pno-enemy-label">Enemy profiles</span>`;
      const cards = readyProfiles.map((item, index) => {
        const history = item.history || {};
        const historyStats = history.stats || item.stats ? `<div class="pno-enemy-stats">History · VPIP ${((history.stats || item.stats || {}).vpip ?? '—')}% · PFR ${((history.stats || item.stats || {}).pfr ?? '—')}% · 3bet ${((history.stats || item.stats || {}).threeBet ?? '—')}% · CBET ${((history.stats || item.stats || {}).cBet ?? '—')}% · AF ${((history.stats || item.stats || {}).af ?? '—')}</div>` : '';
        const categoryLabel = item.category ? `<div class="pno-enemy-category">Danh mục: ${item.category.label}</div>` : '';
        const categoryNote = item.category ? `<div class="pno-enemy-note">${item.category.note}</div>` : '';
        const historyBody = (history.notes || item.notes || []).slice(0, 2).map((note) => `<div class="pno-enemy-note">${note}</div>`).join('');
        const historySummary = Array.isArray(history.strategy || item.strategy)
          ? (history.strategy || item.strategy).map((line) => `<div class="pno-enemy-strategy-line">${line}</div>`).join('')
          : ((history.strategy || item.strategy) ? `<div class="pno-enemy-strategy-line">${history.strategy || item.strategy}</div>` : '');
        const live = item.live || {};
        const liveBody = (live.notes || []).map((note) => `<div class="pno-enemy-note">${note}</div>`).join('');
        const playerName = item.player ? (item.player.name || (item.player.seat != null ? `Seat ${item.player.seat}` : 'Enemy')) : 'Enemy';
        const playerSeat = item.player && item.player.seat != null ? `<span class="pno-enemy-seat">· Seat ${item.player.seat}</span>` : '';
        const estimate = live.rangeLabel ? `<span class="pno-enemy-estimate">${live.rangeLabel}</span>` : '';
        const playerLabel = `<div class="pno-enemy-player"><span class="pno-enemy-player-name">${playerName}</span>${estimate}${playerSeat}</div>`;
        const compact = `<div class="pno-enemy-compact">${item.category ? item.category.label : 'Profile'} · ${(history.style || item.style || 'mixed').replace(/-/g, ' ')} · ${(history.tightnessPct ?? item.tightnessPct ?? 0)}% tight</div>`;
        const body = `<div class="pno-enemy-body">${historyStats}${categoryLabel}${categoryNote}<div class="pno-enemy-style">${(history.style || item.style || 'mixed').replace(/-/g, ' ')} · ${(history.tightnessPct ?? item.tightnessPct ?? 0)}% tight · ${(history.aggressionPct ?? item.aggressionPct ?? 0)}% aggressive</div>${historyBody}<div class="pno-enemy-strategy"><span class="pno-enemy-strategy-label">Cách chơi:</span>${historySummary}</div></div>`;
        const liveSection = `<div class="pno-enemy-section"><div class="pno-enemy-section-label">Current hand</div><div class="pno-enemy-note">Street: ${live.street || 'preflop'}</div><div class="pno-enemy-note">Action: ${live.action || '—'}</div><div class="pno-enemy-note">Range: top ${live.rangeLabel || 'mixed'}</div><div class="pno-enemy-note">${live.opponents > 2 ? 'Multiway pot' : `Heads-up / ${live.opponents}-way`}</div>${liveBody}</div>`;
        const playerKey = item.player ? `${item.player.seat ?? ''}:${String(item.player.name || '').trim().toLowerCase()}` : `enemy-${index}`;
        const expanded = expandedEnemyCards.has(playerKey) ? 'pno-enemy-expanded' : '';
        return `<div class="pno-enemy-card ${expanded}" data-enemy-key="${playerKey}"><button class="pno-enemy-toggle" type="button">${playerLabel}${compact}</button><div class="pno-enemy-details">${body}${liveSection}</div></div>`;
      }).join('');
      enemy.innerHTML = `${head}${cards}`;
      const toggleEnemyCard = (card) => {
        if (!card) return;
        const key = card.getAttribute('data-enemy-key');
        const expanded = card.classList.toggle('pno-enemy-expanded');
        if (key) {
          if (expanded) expandedEnemyCards.add(key);
          else expandedEnemyCards.delete(key);
        }
      };
      enemy.querySelectorAll('.pno-enemy-card').forEach((card) => {
        card.addEventListener('click', (event) => {
          if (event.target.closest('.pno-enemy-toggle')) return;
          toggleEnemyCard(card);
        });
      });
      enemy.querySelectorAll('.pno-enemy-toggle').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const card = btn.closest('.pno-enemy-card');
          toggleEnemyCard(card);
        });
      });
      enemy.style.display = 'block';
    }

    // Render draw info (flush/straight outs). Pass a falsy value to clear.
    function setDraws(info) {
      if (!info || !info.draws || !info.draws.length) {
        draws.textContent = '';
        return;
      }
      const labels = info.draws.map((d) => `${d.name} (${d.outs})`).join(' + ');
      draws.textContent = `${labels} · ${info.outs} outs · ${info.note}`;
    }

    function showResult(res, decision, rangeLabel) {
      setDecision(decision);
      if (!res) {
        equityVal.textContent = '—';
        barFill.style.width = '0%';
        detail.textContent = 'Enter your two hole cards to calculate';
        draws.textContent = '';
        stack.textContent = ''; stack.style.display = 'none';
        beats.textContent = ''; beats.style.display = 'none';
        composition.textContent = ''; composition.style.display = 'none';
        coach.textContent = '';
        coach.style.display = 'none';
        return;
      }
      const pct = (res.equity * 100);
      equityVal.textContent = pct.toFixed(1) + '%';
      barFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
      detail.textContent =
        `Win ${(res.win * 100).toFixed(1)}% · Tie ${(res.tie * 100).toFixed(1)}% · ` +
        `Lose ${(res.lose * 100).toFixed(1)}% · ${res.iterations.toLocaleString()} sims` +
        (rangeLabel ? ` · vs ${rangeLabel}` : '');
    }

    return {
      root,
      getInputs,
      setCards,
      setMeta,
      setStack,
      setDraws,
      setBeats,
      setComposition,
      setCoach,
      setEnemyProfile,
      setPosition,
      setEV,
      showResult,
      onChange(fn) { changeHandler = fn; },
      setEnabled(on) { root.style.display = on ? '' : 'none'; },
    };
  }

  function makeDraggable(root, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('pno-collapse')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const rect = root.getBoundingClientRect();
      ox = rect.left; oy = rect.top;
      root.style.right = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      root.style.left = ox + (e.clientX - sx) + 'px';
      root.style.top = oy + (e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  PNO.overlay = { create };
})();
