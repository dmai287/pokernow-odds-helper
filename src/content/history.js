// history.js — records completed hands to chrome.storage.local for later review.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const KEY = 'handHistory';
  const CAP = 300; // keep the most recent N hands

  function streetName(boardLen) {
    if (boardLen >= 5) return 'river';
    if (boardLen === 4) return 'turn';
    if (boardLen === 3) return 'flop';
    return 'preflop';
  }

  // True only while the extension context is valid. After the extension is reloaded,
  // an orphaned content script still runs but every chrome.* call throws
  // "Extension context invalidated" — guard against that.
  function isAlive() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id && chrome.storage);
    } catch (e) {
      return false;
    }
  }

  function add(record) {
    if (!isAlive()) return;
    try {
      chrome.storage.local.get({ [KEY]: [] }, (data) => {
        try {
          if (chrome.runtime.lastError) return;
          const list = data[KEY] || [];
          list.push(record);
          while (list.length > CAP) list.shift();
          chrome.storage.local.set({ [KEY]: list });
        } catch (e) { /* context invalidated mid-callback */ }
      });
    } catch (e) { /* context invalidated */ }
  }

  function getAll(cb) {
    if (!isAlive()) { cb([]); return; }
    try {
      chrome.storage.local.get({ [KEY]: [] }, (d) => cb((d && d[KEY]) || []));
    } catch (e) { cb([]); }
  }

  function clear(cb) {
    if (!isAlive()) { if (cb) cb(); return; }
    try {
      chrome.storage.local.set({ [KEY]: [] }, cb || function () {});
    } catch (e) { if (cb) cb(); }
  }

  PNO.history = { add, getAll, clear, streetName, KEY, CAP };
})();
