// content.js — ties scraper + overlay + equity engine together and keeps them in
// sync with the live table via a debounced MutationObserver.
(function () {
  const PNO = window.PNO;
  if (!PNO || !PNO.overlay) return;

  const DEFAULTS = {
    enabled: true, autoDetect: true, iterations: 2000, villainRange: 100, autoRange: true,
    onlyMyTurn: true, coaching: true,
  };
  let settings = Object.assign({}, DEFAULTS);
  let overlay = null;
  let observer = null;
  let coachProfile = null;
  let lastOppKey = null; // hero-hand key for the last good opponent-count read (anti-stale)

  // Recompute the player's tendency profile from logged hands.
  function refreshCoach() {
    if (!settings.coaching || !PNO.coach || !PNO.history) { coachProfile = null; return; }
    PNO.history.getAll((hands) => { coachProfile = PNO.coach.profile(hands); });
  }

  // After the extension is reloaded, this orphaned content script keeps running but
  // every chrome.* call throws. Detect that and shut ourselves down cleanly.
  function extAlive() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function shutdown() {
    if (observer) { try { observer.disconnect(); } catch (e) {} observer = null; }
    if (overlay) { try { overlay.setEnabled(false); } catch (e) {} }
  }

  // Hand-history tracking: pendingHand holds the latest snapshot of the hand in
  // progress. It is committed to history when the hand ends — detected either by the
  // hole cards clearing, or by a new hand being dealt (different hole cards). The
  // latter is the reliable signal: tables often replace cards with no settled gap.
  let pendingHand = null;
  let pendingHeroKey = null;
  let pendingPlayers = null;
  let pendingSessionId = null;
  let pendingDecisionSnapshot = null;
  let handStartStack = null;

  function makePlayerKey(player) {
    const seat = player && player.seat != null ? player.seat : 'unknown';
    const name = player && player.name ? String(player.name).trim().toLowerCase() : '';
    const stack = player && player.stack != null ? String(player.stack) : '';
    return `${seat}:${name || stack || 'unknown'}`;
  }

  function normalizeDecisionKey(decision) {
    if (!decision || typeof decision !== 'object') return '';
    const action = String(decision.action || '').trim().toLowerCase();
    const tone = String(decision.tone || '').trim().toLowerCase();
    const size = decision.size && typeof decision.size.chips === 'number' ? decision.size.chips : '';
    const reason = String(decision.reason || '').trim();
    return `${action}|${tone}|${size}|${reason}`;
  }

  function appendHandHistoryEntry(hand, entry) {
    if (!hand) return;
    hand.actionHistory = hand.actionHistory || [];
    const last = hand.actionHistory[hand.actionHistory.length - 1];
    if (last
      && last.street === entry.street
      && last.action === entry.action
      && last.rangeLabel === entry.rangeLabel
      && last.pot === entry.pot
      && last.call === entry.call) {
      return;
    }
    hand.actionHistory.push(entry);
  }

  function makeActionHistoryEntry(street, action, rangeLabel, opponents, pot, call, board) {
    return {
      t: Date.now(),
      street,
      action,
      rangeLabel,
      opponents,
      pot,
      call,
      board: Array.isArray(board) ? board.map(PNO.cards.cardToStr) : [],
    };
  }

  function aggregateOpponentStats(profiles) {
    if (!Array.isArray(profiles) || !profiles.length) return null;
    let totalWeight = 0;
    let vpip = 0;
    let pfr = 0;
    let af = 0;
    let tightness = 0;
    let aggression = 0;
    let cBet = 0;
    let foldToAggression = 0;
    let turnAggression = 0;
    let riverAggression = 0;
    let riverCheck = 0;
    let riverCall = 0;
    profiles.forEach((profile) => {
      if (!profile || !profile.stats || typeof profile.stats.sampleSize !== 'number') return;
      const weight = Math.max(1, profile.stats.sampleSize);
      totalWeight += weight;
      const stats = profile.stats;
      vpip += (typeof stats.vpip === 'number' ? stats.vpip : 0) * weight;
      pfr += (typeof stats.pfr === 'number' ? stats.pfr : 0) * weight;
      af += (typeof stats.af === 'number' ? stats.af : 0) * weight;
      tightness += (typeof stats.tightness === 'number' ? stats.tightness : 50) * weight;
      aggression += (typeof stats.aggression === 'number' ? stats.aggression : 50) * weight;
      cBet += (typeof stats.cBet === 'number' ? stats.cBet : 0) * weight;
      foldToAggression += (typeof stats.foldToAggression === 'number' ? stats.foldToAggression : 0) * weight;
      turnAggression += (typeof stats.turnAggression === 'number' ? stats.turnAggression : 0) * weight;
      riverAggression += (typeof stats.riverAggression === 'number' ? stats.riverAggression : 0) * weight;
      riverCheck += (typeof stats.riverCheck === 'number' ? stats.riverCheck : 0) * weight;
      riverCall += (typeof stats.riverCall === 'number' ? stats.riverCall : 0) * weight;
    });
    if (totalWeight <= 0) return null;
    return {
      vpip: Math.round((vpip / totalWeight) * 10) / 10,
      pfr: Math.round((pfr / totalWeight) * 10) / 10,
      af: Math.round((af / totalWeight) * 10) / 10,
      tightness: Math.round(tightness / totalWeight),
      aggression: Math.round(aggression / totalWeight),
      cBet: Math.round(cBet / totalWeight),
      foldToAggression: Math.round(foldToAggression / totalWeight),
      turnAggression: Math.round(turnAggression / totalWeight),
      riverAggression: Math.round(riverAggression / totalWeight),
      riverCheck: Math.round(riverCheck / totalWeight),
      riverCall: Math.round(riverCall / totalWeight),
      sampleSize: totalWeight,
    };
  }

  function clearPendingDecision() {
    pendingSessionId = null;
    pendingDecisionSnapshot = null;
  }

  function commitHand(endStack) {
    if (!pendingHand) return;
    if (typeof endStack === 'number') pendingHand.endStack = endStack;
    pendingHand.net = (typeof handStartStack === 'number' && typeof pendingHand.endStack === 'number')
      ? pendingHand.endStack - handStartStack : null;
    const handRecord = Object.assign({}, pendingHand);
    PNO.history.add(handRecord);

    if ((pendingPlayers || []).length) {
      const enemyRecords = pendingPlayers.map((player) => Object.assign({}, pendingHand, {
        playerKey: makePlayerKey(player),
        seat: player.seat,
        playerName: player.name || (player.seat != null ? `Seat ${player.seat}` : 'Enemy'),
        playerCards: Array.isArray(player.cards) ? player.cards.map(PNO.cards.cardToStr) : [],
        stack: player.stack,
        stackBucket: player.stack != null ? Math.round(player.stack / 100) * 100 : null,
      }));
      enemyRecords.forEach((record) => { if (typeof PNO.history.addEnemy === 'function') PNO.history.addEnemy(record); });
    }

    if (pendingSessionId && PNO.cash && typeof PNO.cash.resolveDecision === 'function') {
      PNO.cash.resolveDecision(pendingSessionId, { result: 'hand-ended' });
    }
    pendingHand = null;
    pendingHeroKey = null;
    pendingPlayers = null;
    clearPendingDecision();
    handStartStack = null;
    refreshCoach(); // learn from the hand just logged
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function recompute() {
    if (!overlay) return;
    if (!extAlive()) { shutdown(); return; } // orphaned after an extension reload
    const state = overlay.getInputs();
    let position = null;
    let heroStack = null;
    let myTurn = null;
    let stackBucket = null;
    let scraped = null;

    let bb = null;
    if (settings.autoDetect) {
      scraped = PNO.scraper.scrape();
      heroStack = scraped.heroStack;
      bb = scraped.bb;
      myTurn = scraped.myTurn;
      stackBucket = scraped.opponentStackBucket;
      // Mirror the live table exactly, including empties. When a hand ends and the
      // board / hole cards clear, this resets the displayed cards and odds instead of
      // leaving the previous hand's numbers on screen.
      state.hero = scraped.hero;
      state.board = scraped.board;
      overlay.setCards(state.hero, state.board);

      // Opponent count drives equity-vs-N. A transient 0 (deal/clear animation) must not
      // carry a count from a *different* hand: keep the prior count only within the same
      // hero hand; on a new hand with no clean read yet, fall back to a neutral 1.
      const oppKey = state.hero.length === 2 ? state.hero.map(PNO.cards.cardToStr).join('') : null;
      if (scraped.opponents > 0) state.opponents = scraped.opponents;
      else if (oppKey && oppKey !== lastOppKey) state.opponents = 1;
      if (oppKey) lastOppKey = oppKey;
      if (scraped.pot != null) state.pot = scraped.pot;
      if (scraped.call != null) state.call = scraped.call;
      overlay.setMeta(
        scraped.opponents > 0 ? scraped.opponents : null,
        scraped.pot,
        scraped.call
      );
      position = scraped.position;
    }
    overlay.setPosition(position);

    if (state.hero.length !== 2) {
      // Hand over (cards cleared): commit the last snapshot.
      if (settings.autoDetect) commitHand(heroStack);

      overlay.setDraws(null);
      overlay.setEV(null);
      overlay.showResult(null, PNO.cash.decide({ equity: null, pot: 0, call: 0, opponents: 1, street: 'preflop' }));
      return;
    }

    const drawInfo = PNO.draws.analyze(state.hero, state.board);
    overlay.setDraws(drawInfo);

    // Build the villain range(s). With auto-range and a multiway bet, model the raiser
    // with a tight range and the callers with a wider one (per-villain ranges).
    const deadCards = state.hero.concat(state.board);
    const autoTight = PNO.ranges.tightnessFromAction(state.pot, state.call, state.board.length);
    const describeRange = (pct, combos) => {
      if (pct == null) return 'Any two cards';
      const percentText = `Top ${Math.round(pct * 100)}%`;
      return combos != null ? `${percentText} of remaining combos (${combos} left)` : percentText;
    };

    let villainRange, rangeLabel;
    if (settings.autoRange) {
      const tightSet = autoTight >= 1 ? null : PNO.ranges.topPercent(autoTight);
      const left = tightSet ? PNO.ranges.aliveRange(tightSet, deadCards) : null;
      const tightText = describeRange(autoTight, left && left.combos);
      if (state.call > 0 && state.opponents > 1) {
        const callerSet = PNO.ranges.topPercent(0.50);
        villainRange = [tightSet];
        for (let i = 1; i < state.opponents; i++) villainRange.push(callerSet);
        rangeLabel = `${tightText} (auto) · callers top 50%`;
      } else {
        villainRange = tightSet;
        rangeLabel = tightSet ? `${tightText} (auto)` : 'Any two cards';
      }
    } else {
      const p = Math.max(5, Math.min(100, settings.villainRange || 100)) / 100;
      villainRange = p >= 1 ? null : PNO.ranges.topPercent(p);
      const left = villainRange ? PNO.ranges.aliveRange(villainRange, deadCards) : null;
      rangeLabel = villainRange ? describeRange(p, left && left.combos) : 'Any two cards';
    }

    // "What beats you" — weight by the bettor's range when we have one (use the tight
    // aggressor range in multiway), else by the single range / all hands.
    const beatsRange = Array.isArray(villainRange) ? villainRange[0] : villainRange;
    overlay.setBeats(PNO.beats.analyze(state.hero, state.board, beatsRange));

    // Preflop: show the villain's range composition (high vs low) from their action.
    overlay.setComposition(
      state.board.length === 0 ? PNO.composition.analyze(beatsRange, state.hero) : null
    );

    const res = PNO.equity.monteCarlo(
      state.hero, state.board, state.opponents, settings.iterations, villainRange
    );

    // Preflop, prefer position-based starting-hand advice; postflop use equity/pot odds
    // (with implied odds for draws and a stack-behind estimate).
    const preflopInput = {
      hole: state.hero,
      position: position ? position.name : null,
      positionGroup: position ? position.group : null,
      inPosition: position ? position.inPosition : undefined,
      call: state.call,
      bb,
      effStack: typeof heroStack === 'number' ? heroStack : 0,
      opponentStats: null,
    };
    const preflopAdvice = (state.board.length === 0 && PNO.preflop && typeof PNO.preflop.advise === 'function')
      ? PNO.preflop.advise(preflopInput)
      : null;

    const opponentBets = (scraped.players || [])
      .filter((player) => player && !player.hero && player.active)
      .map((player) => (typeof player.bet === 'number' ? player.bet : 0));
    const maxOpponentBet = opponentBets.length ? Math.max.apply(null, opponentBets) : 0;
    const enemyDecisionAction = state.call > 0
      ? ((typeof bb === 'number' && state.call >= Math.max(2, bb * 1.5)) ? 'raise' : 'bet')
      : (maxOpponentBet > 0 ? 'bet' : 'check');

    const decisionInput = {
      equity: res ? res.equity : null,
      pot: state.pot,
      call: state.call,
      opponents: state.opponents,
      inPosition: position ? position.inPosition : undefined,
      outs: drawInfo ? drawInfo.outs : 0,
      effStack: typeof heroStack === 'number' ? Math.max(0, heroStack - state.call) : 0,
      position: position ? position.name : null,
      street: PNO.history.streetName(state.board.length),
      action: enemyDecisionAction,
      board: state.board.map(PNO.cards.cardToStr),
      hero: state.hero.map(PNO.cards.cardToStr),
      opponentStats: null,
      blockers: null,
    };

    let decision = preflopAdvice
      ? preflopAdvice
      : res
        ? PNO.cash.decide(decisionInput)
        : { action: '—', tone: 'bad', reason: 'Duplicate card detected — check your inputs.' };

    function publishDecision(currentDecision) {
      const decisionKey = normalizeDecisionKey(currentDecision);
      if (settings.autoDetect && decisionKey) {
        const sameDecision = pendingDecisionSnapshot === decisionKey;
        if (!sameDecision) {
          pendingDecisionSnapshot = decisionKey;
          if (!pendingSessionId) {
            pendingSessionId = `hand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          }
          if (PNO.cash && typeof PNO.cash.logDecision === 'function') {
            PNO.cash.logDecision(decisionInput, currentDecision, pendingSessionId);
          }
        }
      }
      return currentDecision;
    }

    decision = publishDecision(decision);

    // Advise only on your turn (when enabled and we can tell it isn't): keep the
    // equity/draws/EV as information but hold the Fold/Call/Raise call.
    const shownDecision = (settings.autoDetect && settings.onlyMyTurn && myTurn === false)
      ? { action: '⏳ Not your turn', tone: 'neutral',
          reason: 'Advice appears when it’s your action.' }
      : decision;
    overlay.showResult(res, shownDecision, rangeLabel);

    // Coaching nudge from the player's own history, relevant to this spot.
    if (settings.coaching && coachProfile && PNO.coach) {
      overlay.setCoach(PNO.coach.note(coachProfile, {
        street: PNO.history.streetName(state.board.length),
        inPosition: position ? position.inPosition : undefined,
        action: decision.action,
        facingBet: state.call > 0,
        // Only nudge "you over-call rivers" when THIS spot is actually marginal (equity
        // near the price) — not on comfortable value calls.
        marginal: (res && state.call > 0)
          ? Math.abs(res.equity - state.call / (state.pot + state.call)) < 0.12
          : undefined,
      }));
    } else {
      overlay.setCoach(null);
    }

    // Board-texture note — gated on the equity/SPR we already computed, single-street.
    if (PNO.texture) {
      const tex = PNO.texture.analyze(state.hero, state.board);
      const texSpr = (typeof heroStack === 'number' && state.pot > 0) ? heroStack / state.pot : null;
      overlay.setTexture(tex ? {
        note: PNO.texture.note(tex, {
          equity: res ? res.equity : null,
          toCall: state.call,
          spr: texSpr,
        }),
        wetness: tex.wetness,
      } : null);
    }

    // Stack-depth readout (chips · big blinds · SPR) — factored into the advice above.
    if (typeof heroStack === 'number' && heroStack > 0) {
      const stackBB = bb > 0 ? heroStack / bb : null;
      const spr = (state.board.length > 0 && state.pot > 0) ? heroStack / state.pot : null;
      overlay.setStack({
        chips: heroStack,
        bb: stackBB,
        spr,
        short: stackBB != null && stackBB <= 20,
        lowSpr: spr != null && spr <= 2.5,
      });
    } else {
      overlay.setStack(null);
    }

    // Opponent profile from logged hands and the current live spot. Only read storage
    // when the module is actually present — avoids a chrome.storage read every tick.
    if (PNO.enemies) {
      PNO.history.getEnemyAll((hands) => {
        const activeOpponents = (scraped.players || []).filter((player) => player && !player.hero && player.active);
        const profiles = activeOpponents.length
          ? activeOpponents.map((player) => {
              const profile = PNO.enemies.profile(hands, {
                street: PNO.history.streetName(state.board.length),
                opponents: state.opponents,
                rangeLabel,
                action: enemyDecisionAction,
                stackBucket,
                playerKey: makePlayerKey(player),
                seat: player.seat,
                name: player.name,
                stack: player.stack,
              });
              return Object.assign(profile, {
                player: { seat: player.seat, name: player.name || `Seat ${player.seat}`, stack: player.stack },
                hasHistory: Array.isArray(hands) && hands.length >= 3,
              });
            })
          : [Object.assign(PNO.enemies.profile(hands, {
              street: PNO.history.streetName(state.board.length),
              opponents: state.opponents,
              rangeLabel,
              action: enemyDecisionAction,
              stackBucket,
            }), { hasHistory: Array.isArray(hands) && hands.length >= 3 })];
        overlay.setEnemyProfile(profiles);

        const opponentStats = aggregateOpponentStats(profiles);
        if (state.board.length === 0 && opponentStats && PNO.preflop && typeof PNO.preflop.advise === 'function') {
          const updatedPreflop = PNO.preflop.advise(Object.assign({}, preflopInput, { opponentStats }));
          if (updatedPreflop && normalizeDecisionKey(updatedPreflop) !== normalizeDecisionKey(decision)) {
            decision = publishDecision(updatedPreflop);
            const shownDecisionWithStats = (settings.autoDetect && settings.onlyMyTurn && myTurn === false)
              ? { action: '⏳ Not your turn', tone: 'neutral', reason: 'Advice appears when it’s your action.' }
              : decision;
            overlay.showResult(res, shownDecisionWithStats, rangeLabel);
          }
        }

        if (opponentStats) {
          const updatedDecision = PNO.cash.decide(Object.assign({}, decisionInput, { opponentStats }));
          if (normalizeDecisionKey(updatedDecision) !== normalizeDecisionKey(decision)) {
            decision = publishDecision(updatedDecision);
            const shownDecisionWithStats = (settings.autoDetect && settings.onlyMyTurn && myTurn === false)
              ? { action: '⏳ Not your turn', tone: 'neutral', reason: 'Advice appears when it’s your action.' }
              : decision;
            overlay.showResult(res, shownDecisionWithStats, rangeLabel);
          }
        }

        overlay.setShowdown(null);
      });
    } else {
      overlay.setEnemyProfile(null);
      overlay.setShowdown(null);
    }

    // Expected value of calling — only meaningful when there's a bet to call.
    const ev = (res && state.call > 0)
      ? PNO.equity.callEV(res.equity, state.pot, state.call) : null;
    if (ev != null) overlay.setEV({ ev, win: state.pot });
    else overlay.setEV(null);

    // Update the hand-in-progress snapshot (committed to history when the hand ends).
    if (settings.autoDetect) {
      const heroKey = state.hero.map(PNO.cards.cardToStr).join('');
      // New hand dealt (different hole cards): commit the previous one. The current
      // stack already reflects that hand's result, so it serves as the end stack.
      if (pendingHand && pendingHeroKey !== heroKey) {
        commitHand(heroStack);
      }
      const sameHand = pendingHand && pendingHeroKey === heroKey;

      // The pot only grows within a hand. Once the hand resolves, the table resets the
      // pot (and call) to 0 while the hole cards are still shown — don't let that empty
      // state overwrite the last live snapshot (this was logging pot/call as 0).
      const resetting = sameHand && state.pot < (pendingHand.pot || 0);
      if (!resetting) {
        if (pendingHand === null) handStartStack = heroStack; // first tick of a new hand
        pendingHeroKey = heroKey;
        pendingPlayers = (scraped.players || []).filter((player) => player && !player.hero && player.active);
        const history = pendingHand && Array.isArray(pendingHand.actionHistory)
          ? pendingHand.actionHistory.slice() : [];
        pendingHand = Object.assign({}, pendingHand || {}, {
          t: Date.now(),
          hero: state.hero.map(PNO.cards.cardToStr),
          board: state.board.map(PNO.cards.cardToStr),
          street: PNO.history.streetName(state.board.length),
          position: position ? position.name : null,
          inPosition: position ? position.inPosition : null,
          opponents: state.opponents,
          pot: state.pot,
          call: state.call,
          equity: res ? res.equity : null,
          action: decision.action + (decision.size && decision.size.chips > 0 ? ` → ${decision.size.chips}` : ''),
          ev,
          range: rangeLabel,
          endStack: heroStack,
          stackBucket,
          sessionId: pendingSessionId,
          actionHistory: history,
        });
        appendHandHistoryEntry(
          pendingHand,
          makeActionHistoryEntry(
            pendingHand.street,
            enemyDecisionAction,
            rangeLabel,
            state.opponents,
            state.pot,
            state.call,
            state.board
          )
        );
      }
    }
  }

  function start() {
    overlay = PNO.overlay.create();
    overlay.setEnabled(settings.enabled);

    const debounced = debounce(recompute, 350);
    overlay.onChange(debounced);

    observer = new MutationObserver(debounced);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-card'],
    });

    // React to live settings changes from the popup, and to history updates.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      let touched = false;
      for (const key of Object.keys(DEFAULTS)) {
        if (changes[key]) { settings[key] = changes[key].newValue; touched = true; }
      }
      if (changes[PNO.history.KEY]) refreshCoach(); // history cleared/updated elsewhere
      if (touched) {
        overlay.setEnabled(settings.enabled);
        refreshCoach(); // e.g. coaching toggled on
        recompute();
      }
    });

    refreshCoach();
    recompute();
  }

  chrome.storage.local.get(DEFAULTS, (stored) => {
    settings = Object.assign({}, DEFAULTS, stored);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  });
})();
