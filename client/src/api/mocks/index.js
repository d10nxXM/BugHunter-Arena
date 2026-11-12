// In-browser mock of the API in docs/API.md, used when VITE_USE_MOCKS=true.
// mockRequest returns { status, data } like the real fetch path, so src/api/client.js handles
// errors the same way for both. Loaded only through a dynamic import in client.js.
import * as f from './fixtures.js';

const DELAY_MS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HINTS = { 1: f.hintLevel1, 2: f.hintLevel2, 3: f.hintLevel3 };

const HANDLE = /^[a-z0-9_]{3,20}$/;
const RESERVED_HANDLES = new Set(
  'me admin api auth login signup profile u null undefined'.split(' '),
);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Password of the fixture account (f.loginRequest) in mock mode. */
export const MOCK_PASSWORD = f.loginRequest.password;

let evaluatedAttempts = new Set();
// Accounts by email ({ password, user }) and access tokens -> user, so login, /api/me and
// profiles agree within one page session.
let accounts;
let tokens;
let tokenCounter;

function seedAccounts() {
  accounts = new Map([[f.loginRequest.email, { password: MOCK_PASSWORD, user: f.accountUser }]]);
  tokens = new Map([
    [f.authSession.accessToken, f.accountUser],
    [f.refreshResponse.session.accessToken, f.accountUser],
  ]);
  tokenCounter = 0;
}
seedAccounts();

/** Clears mock state (evaluated attempts, accounts). For tests. */
export function resetMocks() {
  evaluatedAttempts = new Set();
  seedAccounts();
}

function findByHandle(handle) {
  for (const { user } of accounts.values()) if (user.handle === handle) return user;
  return null;
}

function newSession(user) {
  tokenCounter += 1;
  const accessToken = `mock-access-token-${tokenCounter}`;
  if (user) tokens.set(accessToken, user);
  return {
    accessToken,
    refreshToken: `mock-refresh-token-${tokenCounter}`,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

function bearerUser(headers) {
  const header = headers?.Authorization ?? headers?.authorization;
  const match = typeof header === 'string' ? header.match(/^Bearer (.+)$/) : null;
  return match ? (tokens.get(match[1]) ?? null) : null;
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
function route(method, url, body, headers) {
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

  if (method === 'POST' && path === '/api/auth/signup') {
    const handle = typeof body?.handle === 'string' ? body.handle.trim().toLowerCase() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (
      !HANDLE.test(handle) ||
      RESERVED_HANDLES.has(handle) ||
      !EMAIL.test(email) ||
      email.length > 254 ||
      password.length < 10 ||
      password.length > 72
    ) {
      return reply(400, f.errorValidationGeneric);
    }
    if (findByHandle(handle)) return reply(409, f.errorHandleTaken);
    if (accounts.has(email)) return reply(409, f.errorEmailTaken);
    const user = {
      id: newId(f.accountUser.id),
      handle,
      displayName: handle,
      memberSince: new Date().toISOString(),
    };
    accounts.set(email, { password, user });
    return reply(201, { session: newSession(user), user, claimed: false });
  }

  if (method === 'POST' && path === '/api/auth/login') {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) return reply(400, f.errorValidationGeneric);
    const account = accounts.get(email);
    if (!account || account.password !== password) return reply(401, f.errorInvalidCredentials);
    return reply(200, { session: newSession(account.user), user: account.user });
  }

  if (method === 'POST' && path === '/api/auth/refresh') {
    const refreshToken = body?.refreshToken;
    if (typeof refreshToken !== 'string' || refreshToken === '') {
      return reply(400, f.errorValidationGeneric);
    }
    if (refreshToken === 'revoked') return reply(401, f.errorUnauthorized);
    // The mock cannot tell whose refresh token this is; it hands out the fixture account.
    return reply(200, { session: newSession(f.accountUser) });
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    if (!bearerUser(headers)) return reply(401, f.errorUnauthorized);
    return { status: 204, data: null };
  }

  if (method === 'GET' && path === '/api/me') {
    const user = bearerUser(headers);
    return user ? reply(200, user) : reply(401, f.errorUnauthorized);
  }

  if (method === 'GET' && path === '/api/leaderboard') {
    const raw = query.get('limit');
    const limit = raw === null ? 50 : Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return reply(400, f.errorValidationGeneric);
    }
    return reply(200, { ...f.leaderboard, entries: f.leaderboard.entries.slice(0, limit) });
  }

  if ((match = path.match(/^\/api\/profiles\/([^/]+)$/)) && method === 'GET') {
    const handle = decodeURIComponent(match[1]);
    if (!HANDLE.test(handle)) return reply(400, f.errorValidationGeneric);
    if (handle === f.profile.handle) return reply(200, f.profile);
    const user = findByHandle(handle);
    if (!user) return reply(404, f.errorProfileNotFound);
    return reply(200, {
      ...f.profileEmpty,
      handle: user.handle,
      displayName: user.displayName,
      memberSince: user.memberSince,
    });
  }

  return reply(404, f.errorRouteNotFound);
}

/**
 * @param {{ method?: string, path: string, body?: unknown, signal?: AbortSignal,
 *   headers?: Record<string, string> }} req
 * @returns {Promise<{ status: number, data: unknown }>}
 */
export async function mockRequest({ method = 'GET', path, body, signal, headers }) {
  await delay(signal);
  // Round-trip the body through JSON, like a real request would.
  const parsedBody = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
  return route(method.toUpperCase(), new URL(path, 'http://mock.local'), parsedBody, headers);
}
