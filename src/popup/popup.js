// popup.js — reads/writes settings to chrome.storage.local; the content script
// listens for changes and updates the overlay live.
const DEFAULTS = {
  enabled: true, autoDetect: true, iterations: 2000, villainRange: 100, autoRange: true,
};

const enabled = document.getElementById('enabled');
const autoDetect = document.getElementById('autoDetect');
const iterations = document.getElementById('iterations');
const iterVal = document.getElementById('iterVal');
const villainRange = document.getElementById('villainRange');
const rangeVal = document.getElementById('rangeVal');
const autoRange = document.getElementById('autoRange');

const rangeLabel = (v) => (Number(v) >= 100 ? 'any two' : 'top ' + v + '%');

function render(s) {
  enabled.checked = s.enabled;
  autoDetect.checked = s.autoDetect;
  iterations.value = s.iterations;
  iterVal.textContent = Number(s.iterations).toLocaleString();
  villainRange.value = s.villainRange;
  autoRange.checked = s.autoRange;
  rangeVal.textContent = s.autoRange ? 'auto' : rangeLabel(s.villainRange);
  villainRange.disabled = s.autoRange;
}

chrome.storage.local.get(DEFAULTS, render);

// Hand-history button: show the count and open the full log in a new tab.
const histCount = document.getElementById('histCount');
chrome.storage.local.get({ handHistory: [] }, (d) => {
  const n = (d.handHistory || []).length;
  histCount.textContent = n ? `(${n})` : '';
});
document.getElementById('viewHistory').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/history/history.html') });
});

enabled.addEventListener('change', () => chrome.storage.local.set({ enabled: enabled.checked }));
autoDetect.addEventListener('change', () => chrome.storage.local.set({ autoDetect: autoDetect.checked }));
iterations.addEventListener('input', () => {
  iterVal.textContent = Number(iterations.value).toLocaleString();
});
iterations.addEventListener('change', () => {
  chrome.storage.local.set({ iterations: parseInt(iterations.value, 10) });
});
villainRange.addEventListener('input', () => {
  rangeVal.textContent = rangeLabel(villainRange.value);
});
villainRange.addEventListener('change', () => {
  chrome.storage.local.set({ villainRange: parseInt(villainRange.value, 10) });
});
autoRange.addEventListener('change', () => {
  villainRange.disabled = autoRange.checked;
  rangeVal.textContent = autoRange.checked ? 'auto' : rangeLabel(villainRange.value);
  chrome.storage.local.set({ autoRange: autoRange.checked });
});
