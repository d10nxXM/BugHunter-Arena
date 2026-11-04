// In-browser mock of the API in docs/API.md, used when VITE_USE_MOCKS=true.
// mockRequest returns { status, data } like the real fetch path, so src/api/client.js handles
// errors the same way for both. Loaded only through a dynamic import in client.js.
import * as f from './fixtures.js';

const DELAY_MS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HINTS = { 1: f.hintLevel1, 2: f.hintLevel2, 3: f.hintLevel3 };

let evaluatedAttempts = new Set();

/** Clears mock state (evaluated attempts). For tests. */
export function resetMocks() {
  evaluatedAttempts = new Set();
}

function abortError(signal) {
  return signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

function delay(signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(resolve, DELAY_MS);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError(signal));
      },
      { once: true },
    );
  });
}

const reply = (status, data) => ({ status, data: structuredClone(data) });

const CHALLENGE_ID = /^[a-z0-9-]{1,64}$/;
let idCounter = 0;

/** A fresh UUID; without crypto.randomUUID, the fallback UUID with a counter as its last group. */
function newId(fallback) {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  idCounter += 1;
  return `${fallback.slice(0, 24)}${idCounter.toString(16).padStart(12, '0')}`;
}

// The server validates path and body before the handler, so 400 comes before 404 everywhere.
function route(method, url, body) {
  const path = url.pathname;
  const query = url.searchParams;
  let match;

  if (method === 'GET' && path === '/api/health') return reply(200, f.health);
  if (method === 'GET' && path === '/api/challenges') return reply(200, f.challengeList);

  if ((match = path.match(/^\/api\/challenges\/([^/]+)$/)) && method === 'GET') {
    const id = decodeURIComponent(match[1]);
    if (!CHALLENGE_ID.test(id)) return reply(400, f.errorValidationGeneric);
    return id === f.findMaxPublic.id
      ? reply(200, f.findMaxPublic)
      : reply(404, f.errorChallengeNotFound);
  }

  if ((match = path.match(/^\/api\/challenges\/([^/]+)\/hints$/)) && method === 'POST') {
    const id = decodeURIComponent(match[1]);
    const level = body?.level;
    if (!CHALLENGE_ID.test(id) || !Number.isInteger(level) || level < 1 || level > 3) {
      return reply(400, f.errorValidationGeneric);
    }
    if (id !== f.findMaxPublic.id) return reply(404, f.errorChallengeNotFound);
    return reply(200, HINTS[level]);
  }

  if (method === 'POST' && path === '/api/attempts') {
    if (typeof body?.explanation !== 'string' || body.explanation.trim().length < 20) {
      return reply(400, f.errorValidation);
    }
    if (typeof body.challengeId !== 'string' || !CHALLENGE_ID.test(body.challengeId)) {
      return reply(400, f.errorValidationGeneric);
    }
    if (body.challengeId !== f.findMaxPublic.id) return reply(404, f.errorChallengeNotFound);
    return reply(201, { ...f.attemptCreated, attemptId: newId(f.attemptCreated.attemptId) });
  }

  if ((match = path.match(/^\/api\/attempts\/([^/]+)\/evaluation$/)) && method === 'POST') {
    const attemptId = decodeURIComponent(match[1]);
    if (!UUID.test(attemptId) || !Array.isArray(body?.testResults) || !body?.edgeCaseCheck) {
      return reply(400, f.errorValidationGeneric);
    }
    if (evaluatedAttempts.has(attemptId)) return reply(409, f.errorAlreadyEvaluated);
    evaluatedAttempts.add(attemptId);
    const fallback = import.meta.env.VITE_MOCK_EVALUATION === 'fallback';
    return reply(200, fallback ? f.evaluationFallback : f.evaluationAi);
  }

  if (method === 'GET' && path === '/api/progress') {
    const userId = query.get('userId');
    if (!userId || !UUID.test(userId)) return reply(400, f.errorValidationGeneric);
    return reply(200, f.progress);
  }

  if (method === 'GET' && path === '/api/attempts') {
    const userId = query.get('userId');
    if (!userId || !UUID.test(userId)) return reply(400, f.errorValidationGeneric);
    if (query.has('cursorId') && !query.has('cursor')) return reply(400, f.errorValidationGeneric);
    if (query.has('cursor')) return reply(200, []);
    return reply(200, f.attemptsPage);
  }

  if (method === 'POST' && path === '/api/users') {
    const name = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    if (name.length < 2 || name.length > 32) return reply(400, f.errorValidationGeneric);
    return reply(201, { id: newId(f.userCreated.id), displayName: name });
  }

  return reply(404, f.errorRouteNotFound);
}

/**
 * @param {{ method?: string, path: string, body?: unknown, signal?: AbortSignal }} req
 * @returns {Promise<{ status: number, data: unknown }>}
 */
export async function mockRequest({ method = 'GET', path, body, signal }) {
  await delay(signal);
  // Round-trip the body through JSON, like a real request would.
  const parsedBody = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
  return route(method.toUpperCase(), new URL(path, 'http://mock.local'), parsedBody);
}
