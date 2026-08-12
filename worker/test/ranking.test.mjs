import assert from 'node:assert/strict';
import test from 'node:test';
import SurvivorRanking from '../../ranking.js';

const pick = (week, result, margin) => ({ week, team: `Team ${week}`, result, margin });
const manager = (name, lastYearRank, picks, extra = {}) => ({
  name,
  teamLabel: `${name} Team`,
  lastYearRank,
  picks,
  eliminated: picks.some((entry) => entry.result === 'L'),
  ...extra
});

const rank = (managers, options = {}) => SurvivorRanking.rankManagers(managers, {
  totalWeeks: 3,
  throughWeek: 3,
  activeWeek: 3,
  ...options
});

test('survivors rank before eliminated managers and later elimination ranks higher', () => {
  const ranked = rank([
    manager('Week 1 Exit', 1, [pick(1, 'L', -1)]),
    manager('Survivor', 3, [pick(1, 'W', 1), pick(2, 'W', 1), pick(3, 'W', 1)]),
    manager('Week 2 Exit', 2, [pick(1, 'W', 1), pick(2, 'L', -30)])
  ]);
  assert.deepEqual(ranked.map((entry) => entry.name), ['Survivor', 'Week 2 Exit', 'Week 1 Exit']);
});

test('same-week elimination uses that week margin before cumulative margin', () => {
  const ranked = rank([
    manager('Huge Earlier Win', 1, [pick(1, 'W', 50), pick(2, 'L', -10)]),
    manager('Closer Loss', 9, [pick(1, 'W', 1), pick(2, 'L', -3)])
  ]);
  assert.deepEqual(ranked.map((entry) => entry.name), ['Closer Loss', 'Huge Earlier Win']);
});

test('last year finish breaks an equal same-week elimination margin', () => {
  const ranked = rank([
    manager('Prior Ninth', 9, [pick(1, 'L', -7)]),
    manager('Prior Second', 2, [pick(1, 'L', -7)])
  ]);
  assert.deepEqual(ranked.map((entry) => entry.name), ['Prior Second', 'Prior Ninth']);
});

test('all eliminated in the same week are ordered by week margin then prior finish', () => {
  const ranked = rank([
    manager('Lost Big', 1, [pick(1, 'L', -20)]),
    manager('Close Low Prior', 8, [pick(1, 'L', -2)]),
    manager('Close High Prior', 3, [pick(1, 'L', -2)])
  ]);
  assert.deepEqual(ranked.map((entry) => entry.name), ['Close High Prior', 'Close Low Prior', 'Lost Big']);
});

test('survivors use cumulative winning margin then prior finish', () => {
  const ranked = rank([
    manager('Low Margin', 1, [pick(1, 'W', 2), pick(2, 'W', 1)]),
    manager('High Margin', 10, [pick(1, 'W', 10), pick(2, 'W', 2)]),
    manager('Tied Margin Better Prior', 4, [pick(1, 'W', 6), pick(2, 'W', 6)])
  ]);
  assert.deepEqual(ranked.map((entry) => entry.name), ['Tied Margin Better Prior', 'High Margin', 'Low Margin']);
});

test('ties contribute zero and do not eliminate a manager', () => {
  const standing = SurvivorRanking.analyzeManager(
    manager('Tie', 1, [pick(1, 'T', 12)]),
    { totalWeeks: 3, throughWeek: 1, activeWeek: 1 }
  );
  assert.equal(standing.isEliminated, false);
  assert.equal(standing.totalMargin, 0);
  assert.equal(standing.weeks[0].margin, 0);
});

test('a live final result overrides a stale stored elimination flag', () => {
  const standing = SurvivorRanking.analyzeManager(
    manager('Corrected Live', 1, [pick(1, 'L', -3)], { eliminated: true, eliminationWeek: 1 }),
    {
      totalWeeks: 3,
      throughWeek: 1,
      activeWeek: 1,
      outcomeForPick: () => ({ state: 'post', score: 24, oppScore: 17, isTie: false })
    }
  );
  assert.equal(standing.isEliminated, false);
  assert.equal(standing.survivorMargin, 7);
});

test('a buyback protects one loss but a later loss eliminates the manager', () => {
  const standing = SurvivorRanking.analyzeManager(
    manager('Buyback', 1, [pick(1, 'L', -7), pick(2, 'W', 10), pick(3, 'L', -4)], {
      buyback: true,
      carryMargin: -7
    }),
    { totalWeeks: 3, throughWeek: 3, activeWeek: 3 }
  );
  assert.equal(standing.buybackUsed, true);
  assert.equal(standing.isEliminated, true);
  assert.equal(standing.eliminationWeek, 3);
  assert.equal(standing.eliminationMargin, -4);
  assert.equal(standing.totalMargin, -1);
});

test('next-week pick order freezes standings through the prior week', () => {
  const managers = [
    manager('Eliminated', 1, [pick(1, 'L', -1), pick(2, 'W', 50)]),
    manager('Small Win', 2, [pick(1, 'W', 3), pick(2, 'W', 50)]),
    manager('Big Win', 3, [pick(1, 'W', 12), pick(2, 'L', -30)])
  ];
  const weekTwo = SurvivorRanking.orderForPickWeek(managers, 2, { totalWeeks: 3 });
  assert.deepEqual(weekTwo.map((entry) => entry.name), ['Big Win', 'Small Win', 'Eliminated']);
});
