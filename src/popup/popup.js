// popup.js — reads/writes settings to chrome.storage.local; the content script
// listens for changes and updates the overlay live.
const DEFAULTS = { enabled: true, autoDetect: true, iterations: 2000 };

const enabled = document.getElementById('enabled');
const autoDetect = document.getElementById('autoDetect');
const iterations = document.getElementById('iterations');
const iterVal = document.getElementById('iterVal');

function render(s) {
  enabled.checked = s.enabled;
  autoDetect.checked = s.autoDetect;
  iterations.value = s.iterations;
  iterVal.textContent = Number(s.iterations).toLocaleString();
}

chrome.storage.local.get(DEFAULTS, render);

enabled.addEventListener('change', () => chrome.storage.local.set({ enabled: enabled.checked }));
autoDetect.addEventListener('change', () => chrome.storage.local.set({ autoDetect: autoDetect.checked }));
iterations.addEventListener('input', () => {
  iterVal.textContent = Number(iterations.value).toLocaleString();
});
iterations.addEventListener('change', () => {
  chrome.storage.local.set({ iterations: parseInt(iterations.value, 10) });
});
