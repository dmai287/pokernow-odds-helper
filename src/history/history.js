// history.js (viewer) — renders logged hands from chrome.storage.local.
const KEY = 'handHistory';

const rowsEl = document.getElementById('rows');
const emptyEl = document.getElementById('empty');
const summaryEl = document.getElementById('summary');

let hands = [];

function fmtTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function pct(x) { return x == null ? '—' : (x * 100).toFixed(1) + '%'; }
function chips(x) { return x == null ? '—' : Math.round(x).toLocaleString(); }
function signed(x) {
  if (x == null) return '<span class="muted">—</span>';
  const cls = x >= 0 ? 'pos' : 'neg';
  return `<span class="${cls}">${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x)).toLocaleString()}</span>`;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

const leakEl = document.getElementById('leakReport');

function n0(x) { return x == null ? '—' : Math.round(x).toLocaleString(); }
function signedSpan(x) {
  if (x == null) return '<span class="muted">—</span>';
  const cls = x >= 0 ? 'pos' : 'neg';
  return `<span class="${cls}">${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x)).toLocaleString()}</span>`;
}

function renderLeaks() {
  if (!leakEl) return;
  if (!hands.length || !window.PNO || !PNO.leaks) { leakEl.innerHTML = ''; return; }
  const r = PNO.leaks.analyze(hands);

  const posRows = r.byPosition.map((p) =>
    `<tr><td>${esc(p.position)}</td><td class="mono">${p.hands}</td>` +
    `<td class="mono">${p.netPerHand == null ? '<span class="muted">—</span>' : signedSpan(p.netPerHand)}</td></tr>`
  ).join('');

  leakEl.innerHTML =
    `<h2 class="leak-title">📉 Leak Report <small>${r.count} hands${r.hasNet ? `, ${r.netCount} with results` : ''}</small></h2>` +
    `<div class="leak-grid">` +
      `<div class="leak-card"><span class="lk-label">In position</span>${signedSpan(r.ip.netPerHand)}<small>/hand · ${r.ip.hands} hands</small></div>` +
      `<div class="leak-card"><span class="lk-label">Out of position</span>${signedSpan(r.oop.netPerHand)}<small>/hand · ${r.oop.hands} hands</small></div>` +
      `<div class="leak-card"><span class="lk-label">Aggression</span><strong>${r.aggression.ratioPct == null ? '—' : r.aggression.ratioPct + '%'}</strong><small>bets/raises of actions</small></div>` +
      `<div class="leak-card"><span class="lk-label">Reached river</span><strong>${Math.round(r.riverRate * 100)}%</strong><small>of hands</small></div>` +
      `<div class="leak-card"><span class="lk-label">−EV calls</span><strong class="neg">${r.minusEvCalls.count}</strong><small>~${Math.abs(r.minusEvCalls.evLost)} chips lost</small></div>` +
    `</div>` +
    `<div class="leak-cols">` +
      `<div><h3>By position</h3><table class="leak-pos"><thead><tr><th>Seat</th><th>Hands</th><th>Net/hand</th></tr></thead><tbody>${posRows}</tbody></table></div>` +
      `<div><h3>Fix these leaks</h3><ul class="leak-tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` +
        (r.worstHands.length ? `<h3>Biggest losses</h3><ul class="leak-worst">${r.worstHands.map((h) => `<li><span class="mono">${esc(h.hero)}</span> ${h.board ? 'on <span class="mono">' + esc(h.board) + '</span>' : ''} · ${esc(h.position || '—')} · ${signedSpan(h.net)}</li>`).join('')}</ul>` : '') +
      `</div>` +
    `</div>`;
}

function render() {
  rowsEl.innerHTML = '';
  emptyEl.hidden = hands.length > 0;
  renderLeaks();

  hands.slice().reverse().forEach((h, i) => {
    const n = hands.length - i;
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td class="muted">${n}</td>` +
      `<td class="muted">${fmtTime(h.t)}</td>` +
      `<td class="mono">${esc((h.hero || []).join(' '))}</td>` +
      `<td class="mono">${esc((h.board || []).join(' ')) || '<span class="muted">—</span>'}</td>` +
      `<td>${esc(h.street)}</td>` +
      `<td>${esc(h.position || '—')}${h.inPosition === false ? ' <span class="muted">(OOP)</span>' : h.inPosition === true ? ' <span class="pos">(IP)</span>' : ''}</td>` +
      `<td class="mono">${h.opponents == null ? '—' : h.opponents}</td>` +
      `<td class="mono">${chips(h.pot)}</td>` +
      `<td class="mono">${chips(h.call)}</td>` +
      `<td class="mono">${pct(h.equity)}</td>` +
      `<td>${esc(h.action)}</td>` +
      `<td class="mono">${signed(h.ev)}</td>` +
      `<td class="mono">${signed(h.net)}</td>`;
    rowsEl.appendChild(tr);
  });

  renderSummary();
}

function renderSummary() {
  if (!hands.length) { summaryEl.innerHTML = ''; return; }
  const withNet = hands.filter((h) => typeof h.net === 'number');
  const totalNet = withNet.reduce((s, h) => s + h.net, 0);
  const withEv = hands.filter((h) => typeof h.ev === 'number');
  const avgEv = withEv.length ? withEv.reduce((s, h) => s + h.ev, 0) / withEv.length : null;

  summaryEl.innerHTML =
    `<div class="stat"><strong>${hands.length}</strong><span>hands logged</span></div>` +
    (withNet.length ? `<div class="stat">${signed(totalNet)}<span>net (chips, ≈)</span></div>` : '') +
    (avgEv != null ? `<div class="stat">${signed(avgEv)}<span>avg EV of call</span></div>` : '');
}

function toCSV() {
  const cols = ['t', 'hero', 'board', 'street', 'position', 'inPosition', 'opponents', 'pot', 'call', 'equity', 'action', 'ev', 'range', 'net'];
  const head = cols.join(',');
  const lines = hands.map((h) =>
    cols.map((c) => {
      let v = h[c];
      if (Array.isArray(v)) v = v.join(' ');
      if (c === 't') v = new Date(v).toISOString();
      if (v == null) v = '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  );
  return [head, ...lines].join('\n');
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('export').addEventListener('click', () => {
  if (!hands.length) return;
  download(`pokernow-hands-${new Date().toISOString().slice(0, 10)}.csv`, toCSV());
});

document.getElementById('clear').addEventListener('click', () => {
  if (!confirm('Clear all logged hands? This cannot be undone.')) return;
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ [KEY]: [] }, () => { hands = []; render(); });
  } else {
    hands = []; render();
  }
});

// Test hook: lets a harness inject hands without the chrome API.
window.__renderHands = (arr) => { hands = arr || []; render(); };

if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get({ [KEY]: [] }, (d) => { hands = d[KEY] || []; render(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) { hands = changes[KEY].newValue || []; render(); }
  });
} else {
  render(); // rendered empty outside the extension (e.g. in tests)
}
