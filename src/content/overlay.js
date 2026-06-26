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

    // Header (drag handle + collapse)
    const header = el('div', 'pno-header');
    header.appendChild(el('span', 'pno-title', '♠ Odds Helper'));
    const collapseBtn = el('button', 'pno-collapse', '–');
    header.appendChild(collapseBtn);
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

    body.appendChild(results);

    const note = el('div', 'pno-note', 'Study tool · cards auto-fill from the table when detected');
    body.appendChild(note);

    document.body.appendChild(root);

    // Collapse toggle
    collapseBtn.addEventListener('click', () => {
      const collapsed = root.classList.toggle('pno-collapsed');
      collapseBtn.textContent = collapsed ? '+' : '–';
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

    function setDecision(decision) {
      const d = decision || { action: '—', tone: 'neutral', reason: '' };
      decisionAction.textContent = d.action;
      decisionReason.textContent = d.reason;
      decisionBox.className = 'pno-decision pno-' + (d.tone || 'neutral');
    }

    function showResult(res, decision) {
      setDecision(decision);
      if (!res) {
        equityVal.textContent = '—';
        barFill.style.width = '0%';
        detail.textContent = 'Enter your two hole cards to calculate';
        return;
      }
      const pct = (res.equity * 100);
      equityVal.textContent = pct.toFixed(1) + '%';
      barFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
      detail.textContent =
        `Win ${(res.win * 100).toFixed(1)}% · Tie ${(res.tie * 100).toFixed(1)}% · ` +
        `Lose ${(res.lose * 100).toFixed(1)}% · ${res.iterations.toLocaleString()} sims`;
    }

    return {
      root,
      getInputs,
      setCards,
      setMeta,
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
