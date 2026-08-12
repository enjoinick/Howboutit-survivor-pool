import { applySubmission, deriveQueueState, QueueError } from './logic.js';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://enjoinick.github.io',
  'http://127.0.0.1:8765',
  'http://localhost:8765'
];

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  }
});

const allowedOrigins = (env) => String(env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .concat(DEFAULT_ALLOWED_ORIGINS);

const corsHeaders = (request, env) => {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  return origin && allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
};

const assertAllowedOrigin = (request, env) => {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).includes(origin)) {
    throw new QueueError(403, 'origin_not_allowed', 'This pick must be submitted from the pool website.');
  }
};

const assertAdminToken = (request) => {
  const authorization = String(request.headers.get('Authorization') || '');
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new QueueError(401, 'admin_unauthorized', 'The admin save token is invalid.');
  }
  return token;
};

const githubHeaders = (env, token = env.GIST_TOKEN) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'howboutit-pick-queue',
  'X-GitHub-Api-Version': '2026-03-10'
});

const readPoolData = async (env, token = env.GIST_TOKEN) => {
  if (!env.GIST_ID || !token) {
    throw new QueueError(503, 'worker_not_configured', 'The pick service is not configured yet.');
  }
  const response = await fetch(`https://api.github.com/gists/${env.GIST_ID}`, {
    headers: githubHeaders(env, token),
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new QueueError(502, 'gist_read_failed', 'The live pool could not be read.');
  }
  const gist = await response.json();
  const file = gist && gist.files && gist.files['data.json'];
  if (!file || typeof file.content !== 'string' || file.truncated) {
    throw new QueueError(502, 'gist_data_missing', 'The live data.json file is unavailable.');
  }
  try {
    return JSON.parse(file.content);
  } catch {
    throw new QueueError(502, 'gist_data_invalid', 'The live data.json file is invalid.');
  }
};

const writePoolData = async (env, data, token = env.GIST_TOKEN) => {
  const response = await fetch(`https://api.github.com/gists/${env.GIST_ID}`, {
    method: 'PATCH',
    headers: {
      ...githubHeaders(env, token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: {
        'data.json': { content: JSON.stringify(data, null, 2) }
      }
    })
  });
  if (!response.ok) {
    throw new QueueError(502, 'gist_write_failed', 'The pick could not be saved. Please try again.');
  }
};

export class PickQueueCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.pending = Promise.resolve();
  }

  fetch(request) {
    const run = this.pending
      .then(() => this.handle(request))
      .catch((error) => {
        const status = error instanceof QueueError ? error.status : 500;
        const code = error instanceof QueueError ? error.code : 'internal_error';
        const message = error instanceof QueueError ? error.message : 'The pick service encountered an error.';
        console.error('Serialized pick request failed', { code, message: error && error.message });
        return json({ error: code, message }, status);
      });
    this.pending = run.then(() => undefined);
    return run;
  }

  async handle(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/pick-queue' && url.pathname !== '/admin-save') {
      return json({ error: 'not_found', message: 'Route not found.' }, 404);
    }

    if (url.pathname === '/admin-save') {
      if (request.method !== 'POST') {
        return json({ error: 'method_not_allowed', message: 'Method not allowed.' }, 405, { Allow: 'POST, OPTIONS' });
      }
      assertAllowedOrigin(request, this.env);
      const adminToken = assertAdminToken(request);
      const contentType = request.headers.get('Content-Type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new QueueError(415, 'json_required', 'Send the admin save as JSON.');
      }

      let saveRequest;
      try {
        saveRequest = await request.json();
      } catch {
        throw new QueueError(400, 'invalid_json', 'The admin save request is invalid.');
      }
      const baseline = saveRequest && saveRequest.baseline;
      const nextData = saveRequest && saveRequest.data;
      if (!baseline || !nextData || !Array.isArray(nextData.managers) || !nextData.pickQueue) {
        throw new QueueError(422, 'invalid_pool_data', 'The admin save is missing required pool data.');
      }
      if (String(saveRequest.gistId || '') !== String(this.env.GIST_ID || '')) {
        throw new QueueError(422, 'wrong_gist', 'The admin page is configured for a different Gist.');
      }

      const liveData = await readPoolData(this.env, adminToken);
      if (JSON.stringify(liveData) !== JSON.stringify(baseline)) {
        throw new QueueError(409, 'live_data_changed', 'The live pool changed after the admin page loaded. Reload before saving.');
      }
      await writePoolData(this.env, nextData, adminToken);
      return json({ saved: true, lastUpdated: nextData.lastUpdated || null });
    }

    if (request.method === 'GET') {
      const data = await readPoolData(this.env);
      return json({ queue: deriveQueueState(data) });
    }

    if (request.method === 'POST') {
      assertAllowedOrigin(request, this.env);
      const contentType = request.headers.get('Content-Type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new QueueError(415, 'json_required', 'Send the pick as JSON.');
      }
      let submission;
      try {
        submission = await request.json();
      } catch {
        throw new QueueError(400, 'invalid_json', 'The pick request is invalid.');
      }

      const data = await readPoolData(this.env);
      const result = applySubmission(data, submission);
      await writePoolData(this.env, result.data);
      return json({ accepted: true, receipt: result.receipt, queue: result.queue }, 201);
    }

    return json({ error: 'method_not_allowed', message: 'Method not allowed.' }, 405, { Allow: 'GET, POST, OPTIONS' });
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      if (!origin || !allowedOrigins(env).includes(origin)) {
        return json({ error: 'origin_not_allowed' }, 403);
      }
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    try {
      const url = new URL(request.url);
      if (url.pathname === '/health') {
        return json({ status: 'ok', service: 'howboutit-pick-queue' }, 200, cors);
      }
      if (url.pathname !== '/pick-queue' && url.pathname !== '/admin-save') {
        return json({ error: 'not_found', message: 'Route not found.' }, 404, cors);
      }
      const id = env.PICK_QUEUE.idFromName(`season-${env.SEASON || '2026'}`);
      const response = await env.PICK_QUEUE.get(id).fetch(request);
      const headers = new Headers(response.headers);
      Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      const status = error instanceof QueueError ? error.status : 500;
      const code = error instanceof QueueError ? error.code : 'internal_error';
      const message = error instanceof QueueError ? error.message : 'The pick service encountered an error.';
      console.error('Pick queue request failed', { code, message: error && error.message });
      return json({ error: code, message }, status, cors);
    }
  }
};
