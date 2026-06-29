const test = require('node:test');
const assert = require('node:assert/strict');
const enemies = require('../src/poker/enemies');

test('builds a tight-aggressive profile from hand history and the live spot', () => {
  const profile = enemies.profile([
    { action: 'Raise', range: 'top 15%', opponents: 2, street: 'preflop' },
    { action: 'Bet', range: 'top 20%', opponents: 2, street: 'flop' },
    { action: 'Raise', range: 'top 18%', opponents: 2, street: 'turn' },
  ], {
    opponents: 2,
    street: 'flop',
    rangeLabel: 'top 20%',
    action: 'Raise',
  });

  assert.equal(profile.ready, true);
  assert.equal(profile.count, 3);
  assert.equal(profile.style, 'tight-aggressive');
  assert.ok(profile.notes.some((note) => /tight/i.test(note)));
  assert.ok(profile.notes.some((note) => /aggressive/i.test(note)));
  assert.ok(profile.strategy && profile.strategy.length > 0);
  assert.ok(profile.stats && typeof profile.stats.vpip === 'number');
  assert.match(profile.strategy, /preflop|value|bluff|call|fold/i);
});
