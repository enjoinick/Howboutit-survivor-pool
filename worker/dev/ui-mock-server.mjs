// Local-only API used to exercise the public pick form without touching the live Gist.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { applySubmission, deriveQueueState, QueueError } from '../src/logic.js';

let data = JSON.parse(await readFile(new URL('../../data.json', import.meta.url), 'utf8'));
const cors = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:8765',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

const send = (response, status, body) => {
  response.writeHead(status, cors);
  response.end(body ? JSON.stringify(body) : '');
};

createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204);
  if (request.url?.split('?')[0] !== '/pick-queue') return send(response, 404, { error: 'not_found' });
  try {
    if (request.method === 'GET') return send(response, 200, { queue: deriveQueueState(data) });
    if (request.method !== 'POST') return send(response, 405, { error: 'method_not_allowed' });
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const result = applySubmission(data, JSON.parse(Buffer.concat(chunks).toString('utf8')));
    data = result.data;
    return send(response, 201, { accepted: true, receipt: result.receipt, queue: result.queue });
  } catch (error) {
    const status = error instanceof QueueError ? error.status : 500;
    return send(response, status, { error: error.code || 'internal_error', message: error.message });
  }
}).listen(8787, '127.0.0.1', () => {
  console.log('Pick queue UI mock listening on http://127.0.0.1:8787');
});
