// The only module in src/ that talks to the server. Shapes follow docs/API.md.
// Every function takes { signal } = {} last; aborting it rejects with the AbortError unchanged.
//
// ApiError codes:
//   <server code>  the server's error envelope (VALIDATION_ERROR, NOT_FOUND, ...)
//   NETWORK_ERROR  fetch failed, or a non-JSON 502/503/504 (dev proxy while the server is down)
//   TIMEOUT        no answer within the timeout
//   HTTP_ERROR     another non-2xx without a usable error envelope
//   BAD_RESPONSE   2xx whose body is not JSON
//   CLIENT_ERROR   the request body could not be serialised (a bug in the caller)
//
// Accounts: when a session exists (src/lib/session.js), requests carry `Authorization: Bearer`.
// A session that expires within REFRESH_MARGIN_SEC is refreshed first; all callers share one
// refresh. A 401 UNAUTHORIZED on a request that carried the token clears the session (the
// request is not retried). Tokens are never logged.

import { clearSession, readSession, writeSession } from '../lib/session.js';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

const DEFAULT_TIMEOUT_MS = 10000;
const HINT_TIMEOUT_MS = 12000;
// The server's own AI fallback can take about 16 s, so evaluation must wait longer than that.
const EVALUATION_TIMEOUT_MS = 20000;
// Auth calls wait longer: the first one often wakes a sleeping server (Render free tier).
const AUTH_TIMEOUT_MS = 20000;
/** Refresh the access token when it expires in less than this many seconds. */
export const REFRESH_MARGIN_SEC = 60;

const MESSAGE_GENERIC = 'Something went wrong talking to the server.';
const MESSAGE_UNAVAILABLE = 'The server is not available right now.';
const MESSAGE_TIMEOUT = 'The server is not responding. Please try again.';
const MESSAGE_CLIENT = 'Something went wrong in the app. Please try again.';
export const MESSAGE_SESSION_EXPIRED = 'Your session has expired. Please log in again.';

const GATEWAY_STATUSES = new Set([502, 503, 504]);

export class ApiError extends Error {
  /**
   * @param {string} message - English text that is safe to show; never contains the URL or body.
   * @param {{ status?: number | null, code: string, cause?: unknown }} details
   */
  constructor(message, { status = null, code, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Combines signals. Returns the combined signal and a cleanup that removes any listeners. */
function combineSignals(signals) {
  const active = signals.filter(Boolean);
  if (active.length === 1) return { signal: active[0], cleanup: () => {} };
  if (typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any(active), cleanup: () => {} };
  }
  const controller = new AbortController();
  const listeners = [];
  for (const s of active) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    const onAbort = () => controller.abort(s.reason);
    s.addEventListener('abort', onAbort, { once: true });
    listeners.push([s, onAbort]);
  }
  return {
    signal: controller.signal,
    cleanup: () => listeners.forEach(([s, onAbort]) => s.removeEventListener('abort', onAbort)),
  };
}

/**
 * Abort signal that fires after ms, plus a clear() for when the request settles first.
 * A plain timer instead of AbortSignal.timeout: it can be cleared, and fake timers in tests drive it.
 */
function startTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Request timed out.', 'TimeoutError')),
    ms,
  );
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function send({ method, path, body, json, signal, token }) {
  const headers = {};
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (USE_MOCKS) {
    const { mockRequest } = await import('./mocks/index.js');
    return mockRequest({ method, path, body, signal, headers });
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: json,
    signal,
  });
  if (res.status === 204) return { status: 204, data: null };
  const data = await res.json().catch((error) => {
    // Only an unparseable body becomes null; an abort or a network failure while reading propagates.
    if (signal.aborted || error?.name !== 'SyntaxError') throw error;
    return null;
  });
  return { status: res.status, data };
}

function report(method, path, error) {
  if (import.meta.env.DEV) {
    // Route and code only: never the body, the query string or any student text.
    console.warn('[api]', method, path.split('?')[0], error.code ?? error.name);
  }
  return error;
}

function errorFromResponse(status, data) {
  if (status === 204) return null;
  const ok = status >= 200 && status < 300;
  if (data === null || data === undefined) {
    if (ok) return new ApiError(MESSAGE_GENERIC, { status, code: 'BAD_RESPONSE' });
    if (GATEWAY_STATUSES.has(status)) {
      return new ApiError(MESSAGE_UNAVAILABLE, { status, code: 'NETWORK_ERROR' });
    }
    return new ApiError(MESSAGE_GENERIC, { status, code: 'HTTP_ERROR' });
  }
  if (ok) return null;
  const envelope = data?.error;
  const code = typeof envelope?.code === 'string' ? envelope.code : 'HTTP_ERROR';
  const message = typeof envelope?.message === 'string' ? envelope.message : MESSAGE_GENERIC;
  return new ApiError(message, { status, code });
}

let refreshInFlight = null;

function isDeadRefresh(error) {
  return error instanceof ApiError && (error.status === 400 || error.status === 401);
}

/**
 * Refreshes `session` once for all concurrent callers. Resolves with the new stored session.
 * A rejected refresh token (400/401) clears the session ('expired'); other failures keep it.
 */
function refreshShared(session) {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession(session.refreshToken)
      .then((data) => {
        const next = writeSession({ ...data?.session, user: session.user }, 'refresh');
        if (!next) throw new ApiError(MESSAGE_GENERIC, { status: 200, code: 'BAD_RESPONSE' });
        return next;
      })
      .catch((error) => {
        // Only clear if nobody replaced the session meanwhile (a new login).
        if (isDeadRefresh(error) && readSession()?.refreshToken === session.refreshToken) {
          clearSession('expired');
        }
        throw error;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * Access token to send, refreshed first when it is about to expire. Null without a session.
 * A dead refresh token rejects with UNAUTHORIZED; when the refresh fails otherwise (network,
 * timeout) a token that has not expired yet is still used.
 */
async function currentAccessToken() {
  const session = readSession();
  if (!session) return null;
  const nowSec = Date.now() / 1000;
  if (session.expiresAt - nowSec >= REFRESH_MARGIN_SEC) return session.accessToken;
  try {
    return (await refreshShared(session)).accessToken;
  } catch (error) {
    if (isDeadRefresh(error)) {
      throw new ApiError(MESSAGE_SESSION_EXPIRED, { status: 401, code: 'UNAUTHORIZED' });
    }
    if (session.expiresAt > nowSec) return session.accessToken;
    throw error;
  }
}

/**
 * Sends one request and returns the parsed JSON body (null for 204). Throws ApiError (codes
 * above); a caller abort rejects with the caller's AbortError unchanged.
 * `auth`: true (default) sends the session's token when there is one, false sends none, a string
 * sends exactly that token (logout).
 */
export async function request(
  path,
  { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS, auth = true } = {},
) {
  let json;
  try {
    json = body === undefined ? undefined : JSON.stringify(body);
  } catch (cause) {
    throw report(method, path, new ApiError(MESSAGE_CLIENT, { code: 'CLIENT_ERROR', cause }));
  }

  let token = null;
  if (typeof auth === 'string') token = auth;
  else if (auth) {
    try {
      token = await currentAccessToken();
    } catch (error) {
      throw report(method, path, error);
    }
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }
  }

  let timeout;
  let combined;
  let response;
  try {
    timeout = startTimeout(timeoutMs);
    combined = combineSignals([signal, timeout.signal]);
    response = await send({ method, path, body, json, signal: combined.signal, token });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (timeout?.signal.aborted) {
      throw report(method, path, new ApiError(MESSAGE_TIMEOUT, { code: 'TIMEOUT', cause }));
    }
    throw report(method, path, new ApiError(MESSAGE_UNAVAILABLE, { code: 'NETWORK_ERROR', cause }));
  } finally {
    timeout?.clear();
    combined?.cleanup();
  }

  const error = errorFromResponse(response.status, response.data);
  if (error) {
    if (auth === true && token && error.status === 401 && error.code === 'UNAUTHORIZED') {
      // Clear only the session this request used; a newer login must survive.
      if (readSession()?.accessToken === token) clearSession('expired');
    }
    throw report(method, path, error);
  }
  return response.data;
}

const enc = encodeURIComponent;

/** GET /api/health -> { status, ai, demoMode } */
export function getHealth({ signal } = {}) {
  return request('/api/health', { signal });
}

/** GET /api/challenges -> [{ id, title, language, difficulty, bugCategory }] */
export function getChallenges({ signal } = {}) {
  return request('/api/challenges', { signal });
}

/** GET /api/challenges/:id -> public challenge with visibleTests and hintCount */
export function getChallenge(id, { signal } = {}) {
  return request(`/api/challenges/${enc(id)}`, { signal });
}

/**
 * POST /api/challenges/:id/hints -> { level, hint, source }.
 * The client asks for hintsUsed + 1; the order is not enforced here or on the server.
 */
export function requestHint(id, { level, currentAnswer }, { signal } = {}) {
  return request(`/api/challenges/${enc(id)}/hints`, {
    method: 'POST',
    body: { level, currentAnswer },
    signal,
    timeoutMs: HINT_TIMEOUT_MS,
  });
}

/**
 * POST /api/attempts with { challengeId, userId, selectedLines, explanation, edgeCase, fixedCode,
 * hintsUsed, durationSec } -> 201 { attemptId, tests, referenceSolution }
 */
export function createAttempt(body, { signal } = {}) {
  return request('/api/attempts', { method: 'POST', body, signal });
}

/**
 * POST /api/attempts/:id/evaluation with { testResults, edgeCaseCheck }
 * -> { score, breakdown, testsPassed, testsTotal, feedbackSource, feedback }
 */
export function submitEvaluation(attemptId, { testResults, edgeCaseCheck }, { signal } = {}) {
  return request(`/api/attempts/${enc(attemptId)}/evaluation`, {
    method: 'POST',
    body: { testResults, edgeCaseCheck },
    signal,
    timeoutMs: EVALUATION_TIMEOUT_MS,
  });
}

/** GET /api/progress?userId= -> dashboard statistics */
export function getProgress(userId, { signal } = {}) {
  return request(`/api/progress?${new URLSearchParams({ userId })}`, { signal });
}

/**
 * GET /api/attempts -> bare array of attempt summaries, newest first.
 * Unset (null or undefined) params are left out. Pass cursor exactly as received.
 */
export function getAttempts(
  { userId, challengeId, limit, cursor, cursorId } = {},
  { signal } = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ userId, challengeId, limit, cursor, cursorId })) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }
  return request(`/api/attempts?${params}`, { signal });
}

/** Cursor for the next GET /api/attempts page, or null when this page was the last one. */
export function nextAttemptsPage(items, limit = 50) {
  if (!Array.isArray(items) || items.length === 0 || items.length < limit) return null;
  const last = items[items.length - 1];
  return { cursor: last.createdAt, cursorId: last.id };
}

/** POST /api/users { displayName } -> 201 { id, displayName } */
export function createUser(displayName, { signal } = {}) {
  return request('/api/users', { method: 'POST', body: { displayName }, signal });
}

/**
 * POST /api/auth/signup { handle, email, password, claimUserId? }
 * -> 201 { session: { accessToken, refreshToken, expiresAt }, user: { id, handle, displayName,
 * memberSince } }. claimUserId is sent only when given.
 */
export function signup({ handle, email, password, claimUserId }, { signal } = {}) {
  const body = { handle, email, password };
  if (claimUserId) body.claimUserId = claimUserId;
  return request('/api/auth/signup', {
    method: 'POST',
    body,
    signal,
    auth: false,
    timeoutMs: AUTH_TIMEOUT_MS,
  });
}

/** POST /api/auth/login { email, password } -> 200 { session, user } (same shape as signup) */
export function login({ email, password }, { signal } = {}) {
  return request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    signal,
    auth: false,
    timeoutMs: AUTH_TIMEOUT_MS,
  });
}

/** POST /api/auth/refresh { refreshToken } -> 200 { session } */
export function refreshSession(refreshToken, { signal } = {}) {
  return request('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    signal,
    auth: false,
    timeoutMs: AUTH_TIMEOUT_MS,
  });
}

/** POST /api/auth/logout with the given access token -> 204 (resolves null) */
export function logout(accessToken, { signal } = {}) {
  return request('/api/auth/logout', { method: 'POST', signal, auth: accessToken });
}

/** GET /api/me (Bearer) -> { id, handle, displayName, memberSince } */
export function getMe({ signal } = {}) {
  return request('/api/me', { signal });
}

/**
 * GET /api/profiles/:handle (public, no token) -> { handle, displayName, memberSince,
 * rank: { name, xp, nextName, xpToNext }, totalXp, solved, attempted, challengesAvailable,
 * solvedByLanguage: [{ language, solved }], recentSolves: [{ challengeId, title, language,
 * difficulty, bestScore, solvedAt }] }
 */
export function getProfile(handle, { signal } = {}) {
  return request(`/api/profiles/${enc(handle)}`, { signal, auth: false });
}
