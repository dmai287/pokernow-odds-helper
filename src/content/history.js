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

  function add(record) {
    if (!chrome || !chrome.storage) return;
    chrome.storage.local.get({ [KEY]: [] }, (data) => {
      const list = data[KEY] || [];
      list.push(record);
      while (list.length > CAP) list.shift();
      chrome.storage.local.set({ [KEY]: list });
    });
  }

  function getAll(cb) {
    chrome.storage.local.get({ [KEY]: [] }, (d) => cb(d[KEY] || []));
  }

  function clear(cb) {
    chrome.storage.local.set({ [KEY]: [] }, cb || function () {});
  }

  PNO.history = { add, getAll, clear, streetName, KEY, CAP };
})();
