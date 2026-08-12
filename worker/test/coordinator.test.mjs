import test from 'node:test';
import assert from 'node:assert/strict';
import { PickQueueCoordinator } from '../src/index.js';

const buildData = () => ({
  season: 2026,
  pickQueue: {
    enabled: true,
    activeWeek: 1,
    order: ['Weston', 'Jordan'],
    deadlines: { '1': '2099-08-13T19:00:00-04:00' }
  },
  managers: ['Weston', 'Jordan'].map((name, index) => ({
    name,
    teamLabel: `${name} Team`,
    lastYearRank: index + 1,
    eliminated: false,
    picks: [1, 2, 3].map((week) => ({ week, team: '', result: null }))
  })),
  gameResults: {},
  lastUpdated: '2026-08-12T12:00:00.000Z'
});

const env = {
  GIST_ID: 'test-gist',
  GIST_TOKEN: 'test-token',
  ALLOWED_ORIGINS: 'https://enjoinick.github.io'
};

const submissionRequest = (manager, team) => new Request('https://worker.example/pick-queue', {
  method: 'POST',
  headers: {
    Origin: 'https://enjoinick.github.io',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ manager, week: 1, team })
});

test('coordinator serializes simultaneous valid turns against the latest Gist state', async () => {
  let liveData = buildData();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => {
    if ((options.method || 'GET') === 'PATCH') {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const payload = JSON.parse(options.body);
      liveData = JSON.parse(payload.files['data.json'].content);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      files: {
        'data.json': {
          content: JSON.stringify(liveData),
          truncated: false
        }
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const coordinator = new PickQueueCoordinator({}, env);
    const [westonResponse, jordanResponse] = await Promise.all([
      coordinator.fetch(submissionRequest('Weston', 'Jacksonville Jaguars')),
      coordinator.fetch(submissionRequest('Jordan', 'Buffalo Bills'))
    ]);
    assert.equal(westonResponse.status, 201);
    assert.equal(jordanResponse.status, 201);
    assert.equal(liveData.managers[0].picks[0].team, 'Jacksonville Jaguars');
    assert.equal(liveData.managers[1].picks[0].team, 'Buffalo Bills');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('coordinator returns a conflict response for an out-of-order turn', async () => {
  const liveData = buildData();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    files: {
      'data.json': {
        content: JSON.stringify(liveData),
        truncated: false
      }
    }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    const coordinator = new PickQueueCoordinator({}, env);
    const response = await coordinator.fetch(submissionRequest('Jordan', 'Buffalo Bills'));
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.error, 'not_your_turn');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('coordinator rejects the same team for consecutive managers', async () => {
  let liveData = buildData();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => {
    if ((options.method || 'GET') === 'PATCH') {
      const payload = JSON.parse(options.body);
      liveData = JSON.parse(payload.files['data.json'].content);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      files: {
        'data.json': {
          content: JSON.stringify(liveData),
          truncated: false
        }
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const coordinator = new PickQueueCoordinator({}, env);
    const westonResponse = await coordinator.fetch(submissionRequest('Weston', 'Jacksonville Jaguars'));
    const jordanResponse = await coordinator.fetch(submissionRequest('Jordan', 'Jacksonville Jaguars'));
    const payload = await jordanResponse.json();
    assert.equal(westonResponse.status, 201);
    assert.equal(jordanResponse.status, 409);
    assert.equal(payload.error, 'team_taken_this_week');
    assert.equal(liveData.managers[1].picks[0].team, '');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
