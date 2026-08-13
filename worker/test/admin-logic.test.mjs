import assert from 'node:assert/strict';
import test from 'node:test';
import AdminLogic from '../../admin-logic.js';

const manager = (name, lastYearRank, weekOneTeam, result = null, margin = 0, extraPick = {}) => ({
  name,
  teamLabel: `${name} Team`,
  lastYearRank,
  eliminated: false,
  picks: [
    { week: 1, team: weekOneTeam, result, margin, ...extraPick },
    { week: 2, team: '', result: null, margin: 0 },
    { week: 3, team: '', result: null, margin: 0 }
  ]
});

const data = (managers, activeWeek = 1) => ({
  season: 2026,
  managers,
  pickQueue: { enabled: true, activeWeek, orderModes: { '1': 'manual', '2': 'standings', '3': 'standings' } }
});

const finalGame = (homeTeam, homeScore, awayTeam, awayScore) => ({
  status: { type: { state: 'post' } },
  competitions: [{
    competitors: [
      { homeAway: 'home', score: String(homeScore), team: { displayName: homeTeam } },
      { homeAway: 'away', score: String(awayScore), team: { displayName: awayTeam } }
    ]
  }]
});

test('finalization imports finals, preserves valid manual overrides, and closes the next queue', () => {
  const pool = data([
    manager('Alice', 2, 'Buffalo Bills'),
    manager('Bob', 1, 'Miami Dolphins', 'L', -3, { manualResult: true }),
    manager('Charlie', 3, 'New England Patriots')
  ]);
  const result = AdminLogic.finalizePoolWeek(
    pool,
    [
      finalGame('Buffalo Bills', 20, 'New York Jets', 10),
      finalGame('New England Patriots', 17, 'New York Giants', 13)
    ],
    1,
    '2026-08-15T00:00:00.000Z'
  );

  assert.equal(result.finalized, true);
  assert.equal(result.advanced, true);
  assert.equal(result.data.pickQueue.activeWeek, 2);
  assert.equal(result.data.pickQueue.enabled, false);
  assert.equal(result.data.managers[0].picks[0].result, 'W');
  assert.equal(result.data.managers[0].picks[0].margin, 10);
  assert.equal(result.data.managers[1].picks[0].margin, -3);
  assert.equal(result.data.managers[1].eliminated, true);
});

test('finalization does not advance while an eligible game is unfinished', () => {
  const pool = data([manager('Alice', 1, 'Buffalo Bills')]);
  const result = AdminLogic.finalizePoolWeek(pool, [], 1, '2026-08-15T00:00:00.000Z');

  assert.equal(result.finalized, false);
  assert.equal(result.data.pickQueue.activeWeek, 1);
  assert.match(result.errors[0], /not final yet/);
});

test('an inconsistent manual result and margin cannot advance the week', () => {
  const pool = data([manager('Alice', 1, 'Buffalo Bills', 'W', 0, { manualResult: true })]);
  const result = AdminLogic.finalizePoolWeek(pool, [], 1, '2026-08-15T00:00:00.000Z');

  assert.equal(result.finalized, false);
  assert.match(result.errors[0], /positive margin/);
});

test('ties are stored as final results with a zero margin', () => {
  const pool = data([manager('Alice', 1, 'Buffalo Bills')]);
  const result = AdminLogic.finalizePoolWeek(
    pool,
    [finalGame('Buffalo Bills', 17, 'New York Jets', 17)],
    1,
    '2026-08-15T00:00:00.000Z'
  );

  assert.equal(result.finalized, true);
  assert.equal(result.data.managers[0].picks[0].result, 'T');
  assert.equal(result.data.managers[0].picks[0].margin, 0);
  assert.equal(result.data.managers[0].eliminated, false);
});

test('a stale future-week loss cannot eliminate a manager during current-week finalization', () => {
  const alice = manager('Alice', 1, 'Buffalo Bills');
  alice.picks[1] = { week: 2, team: 'Miami Dolphins', result: 'L', margin: -40 };
  const result = AdminLogic.finalizePoolWeek(
    data([alice]),
    [finalGame('Buffalo Bills', 20, 'New York Jets', 10)],
    1,
    '2026-08-15T00:00:00.000Z'
  );

  assert.equal(result.finalized, true);
  assert.equal(result.data.managers[0].eliminated, false);
  assert.equal(result.data.managers[0].eliminationWeek, null);
});

test('a manager eliminated in a prior week is not required to pick in the next week', () => {
  const survivor = manager('Alice', 1, 'Buffalo Bills', 'W', 7);
  survivor.picks[1] = { week: 2, team: 'Miami Dolphins', result: null, margin: 0 };
  const eliminated = manager('Bob', 2, 'New York Jets', 'L', -7);
  eliminated.eliminated = true;
  eliminated.eliminationWeek = 1;
  const secondSurvivor = manager('Charlie', 3, 'Buffalo Bills', 'W', 3);
  secondSurvivor.picks[1] = { week: 2, team: 'New England Patriots', result: null, margin: 0 };
  const pool = data([survivor, eliminated, secondSurvivor], 2);
  const result = AdminLogic.finalizePoolWeek(
    pool,
    [
      finalGame('Miami Dolphins', 24, 'Tampa Bay Buccaneers', 14),
      finalGame('New England Patriots', 17, 'New York Giants', 13)
    ],
    2,
    '2026-08-22T00:00:00.000Z'
  );

  assert.equal(result.finalized, true);
  assert.equal(result.data.pickQueue.activeWeek, 3);
  assert.equal(result.errors.length, 0);
});

test('if everyone is eliminated in the same week, the pool closes without opening an empty week', () => {
  const pool = data([
    manager('Alice', 1, 'Buffalo Bills'),
    manager('Bob', 2, 'Miami Dolphins')
  ]);
  const result = AdminLogic.finalizePoolWeek(
    pool,
    [
      finalGame('Buffalo Bills', 10, 'New York Jets', 20),
      finalGame('Miami Dolphins', 7, 'Tampa Bay Buccaneers', 14)
    ],
    1,
    '2026-08-15T00:00:00.000Z'
  );

  assert.equal(result.finalized, true);
  assert.equal(result.poolComplete, true);
  assert.equal(result.advanced, false);
  assert.equal(result.data.pickQueue.activeWeek, 1);
  assert.equal(result.data.pickQueue.enabled, false);
  assert.equal(result.data.pickQueue.completed, true);
});

test('the pool finalizes as soon as one survivor remains', () => {
  const pool = data([
    manager('Alice', 1, 'Buffalo Bills'),
    manager('Bob', 2, 'Miami Dolphins')
  ]);
  const result = AdminLogic.finalizePoolWeek(
    pool,
    [
      finalGame('Buffalo Bills', 20, 'New York Jets', 10),
      finalGame('Miami Dolphins', 7, 'Tampa Bay Buccaneers', 14)
    ],
    1,
    '2026-08-15T00:00:00.000Z'
  );

  assert.equal(result.finalized, true);
  assert.equal(result.survivorCount, 1);
  assert.equal(result.poolComplete, true);
  assert.equal(result.advanced, false);
  assert.equal(result.data.pickQueue.activeWeek, 1);
  assert.equal(result.data.pickQueue.completed, true);
});
