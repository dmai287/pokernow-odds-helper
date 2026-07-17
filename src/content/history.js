// history.js — records completed hands to chrome.storage.local for later review.
(function () {
  const PNO = (window.PNO = window.PNO || {});
  const KEY = 'handHistory';
  const ENEMY_KEY = 'enemyHandHistory';
  const PROFILE_KEY = 'enemyProfiles';
  const CAP = 1000; // keep the most recent N hands for longer-term profiling

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

  function saveProfileSummary(summary) {
    if (!isAlive()) return;
    try {
      chrome.storage.local.set({ [PROFILE_KEY]: summary || null });
    } catch (e) { /* context invalidated */ }
  }

  function lastError() {
    try { return (chrome.runtime && chrome.runtime.lastError) || null; }
    catch (e) { return null; }
  }

  // Append `record` to the capped list at `key`, dropping the oldest entries to stay
  // under CAP. If the write fails — most importantly QUOTA_BYTES exceeded, which used to
  // silently pin the list at ~590 hands — drop the oldest quarter and retry a few times
  // so the log keeps accepting new hands (evicting old ones) instead of wedging.
  function writeCapped(key, record, onWritten) {
    if (!isAlive()) return;
    try {
      chrome.storage.local.get({ [key]: [] }, (data) => {
        if (lastError()) return;
        let list = (data && data[key]) || [];
        list.push(record);
        while (list.length > CAP) list.shift();
        const trySet = (attempt) => {
          try {
            chrome.storage.local.set({ [key]: list }, () => {
              if (lastError()) {
                if (attempt < 5 && list.length > 20) {
                  list = list.slice(Math.ceil(list.length * 0.25)); // evict oldest 25%, retry
                  trySet(attempt + 1);
                }
                return;
              }
              if (onWritten) { try { onWritten(list); } catch (e) { /* callback failed */ } }
            });
          } catch (e) { /* context invalidated */ }
        };
        trySet(0);
      });
    } catch (e) { /* context invalidated */ }
  }

  function add(record) {
    writeCapped(KEY, record, (list) => {
      if (PNO.enemies && typeof PNO.enemies.profile === 'function') {
        saveProfileSummary(PNO.enemies.profile(list));
      }
    });
  }

  function getAll(cb) {
    if (!isAlive()) { cb([]); return; }
    try {
      chrome.storage.local.get({ [KEY]: [] }, (d) => cb((d && d[KEY]) || []));
    } catch (e) { cb([]); }
  }

  function addEnemy(record) {
    writeCapped(ENEMY_KEY, record, null);
  }

  function getEnemyAll(cb) {
    if (!isAlive()) { cb([]); return; }
    try {
      chrome.storage.local.get({ [ENEMY_KEY]: [] }, (d) => cb((d && d[ENEMY_KEY]) || []));
    } catch (e) { cb([]); }
  }

  function clear(cb) {
    if (!isAlive()) { if (cb) cb(); return; }
    try {
      chrome.storage.local.set({ [KEY]: [], [PROFILE_KEY]: null }, cb || function () {});
    } catch (e) { if (cb) cb(); }
  }

  function clearEnemy(cb) {
    if (!isAlive()) { if (cb) cb(); return; }
    try {
      chrome.storage.local.set({ [ENEMY_KEY]: [] }, cb || function () {});
    } catch (e) { if (cb) cb(); }
  }

  function getProfiles(cb) {
    if (!isAlive()) { cb(null); return; }
    try {
      chrome.storage.local.get({ [PROFILE_KEY]: null }, (d) => cb(d && d[PROFILE_KEY] ? d[PROFILE_KEY] : null));
    } catch (e) { cb(null); }
  }

  PNO.history = { add, addEnemy, getAll, getEnemyAll, clear, clearEnemy, getProfiles, streetName, KEY, ENEMY_KEY, PROFILE_KEY, CAP };
})();
