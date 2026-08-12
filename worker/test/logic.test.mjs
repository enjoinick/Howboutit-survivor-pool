import test from 'node:test';
import assert from 'node:assert/strict';
import { applySubmission, deriveQueueState, QueueError } from '../src/logic.js';

const order = ['Weston', 'Jordan', 'Josh', 'Chris', 'Austin', 'Matt', 'Kevin', 'Michael', 'Ryan', 'Nick'];
const buildData = () => ({
  season: 2026,
  pickQueue: {
    enabled: true,
    activeWeek: 1,
    order,
    deadlines: { '1': '2026-08-13T19:00:00-04:00' }
  },
  managers: order.map((name, index) => ({
    name,
    teamLabel: `${name} Team`,
    lastYearRank: index + 1,
    eliminated: false,
    picks: [1, 2, 3].map((week) => ({ week, team: '', result: null }))
  })),
  gameResults: {},
  lastUpdated: '2026-08-12T12:00:00.000Z'
});

const beforeDeadline = new Date('2026-08-12T20:00:00.000Z');

test('queue starts with the first configured manager', () => {
  const state = deriveQueueState(buildData(), beforeDeadline);
  assert.equal(state.currentManager.name, 'Weston');
  assert.equal(state.currentManager.position, 1);
  assert.equal(state.entries[0].status, 'current');
});

test('the active week selects its own configured order', () => {
  const data = buildData();
  data.pickQueue.activeWeek = 2;
  data.pickQueue.orders = {
    '1': order,
    '2': ['Nick', 'Ryan', 'Michael', 'Kevin', 'Matt', 'Austin', 'Chris', 'Josh', 'Jordan', 'Weston']
  };
  const state = deriveQueueState(data, beforeDeadline);
  assert.equal(state.currentManager.name, 'Nick');
  assert.equal(state.entries[0].name, 'Nick');
  assert.equal(state.entries.at(-1).name, 'Weston');
});

test('an accepted pick advances exactly one turn', () => {
  const result = applySubmission(buildData(), {
    manager: 'Weston',
    week: 1,
    team: 'Jacksonville Jaguars'
  }, beforeDeadline);
  assert.equal(result.receipt.manager, 'Weston');
  assert.equal(result.data.managers[0].picks[0].team, 'Jacksonville Jaguars');
  assert.equal(result.queue.currentManager.name, 'Jordan');
  assert.equal(result.queue.entries[0].status, 'picked');
  assert.equal(result.queue.entries[1].status, 'current');
});

test('out-of-order submissions are rejected', () => {
  assert.throws(
    () => applySubmission(buildData(), { manager: 'Jordan', week: 1, team: 'Buffalo Bills' }, beforeDeadline),
    (error) => error instanceof QueueError && error.code === 'not_your_turn'
  );
});

test('a manager cannot reuse a team from an earlier week', () => {
  const data = buildData();
  data.managers[0].picks[1].team = 'Jacksonville Jaguars';
  assert.throws(
    () => applySubmission(data, { manager: 'Weston', week: 1, team: 'Jacksonville Jaguars' }, beforeDeadline),
    (error) => error instanceof QueueError && error.code === 'team_already_used'
  );
});

test('eliminated managers are skipped unless buyback is active', () => {
  const data = buildData();
  data.managers[0].eliminated = true;
  const state = deriveQueueState(data, beforeDeadline);
  assert.equal(state.currentManager.name, 'Jordan');
  assert.equal(state.entries[0].status, 'ineligible');
});

test('the deadline locks submissions', () => {
  const afterDeadline = new Date('2026-08-13T23:00:01.000Z');
  const state = deriveQueueState(buildData(), afterDeadline);
  assert.equal(state.locked, true);
  assert.throws(
    () => applySubmission(buildData(), { manager: 'Weston', week: 1, team: 'Buffalo Bills' }, afterDeadline),
    (error) => error instanceof QueueError && error.code === 'deadline_passed'
  );
});

test('the queue reports completion after all eligible picks', () => {
  const data = buildData();
  data.managers.forEach((manager, index) => {
    manager.picks[0].team = index % 2 ? 'Buffalo Bills' : 'Jacksonville Jaguars';
  });
  const state = deriveQueueState(data, beforeDeadline);
  assert.equal(state.complete, true);
  assert.equal(state.currentManager, null);
});
