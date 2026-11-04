// The only module in src/ that talks to the server. Shapes follow docs/API.md.
// Every function takes { signal } = {} last; aborting it rejects with the AbortError unchanged.

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

const DEFAULT_TIMEOUT_MS = 10000;
const HINT_TIMEOUT_MS = 12000;
// The server's own AI fallback can take about 16 s, so evaluation must wait longer than that.
const EVALUATION_TIMEOUT_MS = 20000;

const MESSAGE_GENERIC = 'Greška u komunikaciji sa serverom.';
const MESSAGE_UNAVAILABLE = 'Server trenutno nije dostupan.';
const MESSAGE_TIMEOUT = 'Server ne odgovara. Pokušaj ponovo.';

export class ApiError extends Error {
  /**
   * @param {string} message - Montenegrin text that is safe to show; never contains the URL or body.
   * @param {{ status?: number | null, code: string }} details
   */
  constructor(message, { status = null, code }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Combines the caller's signal with the timeout signal. */
function combineSignals(signals) {
  const active = signals.filter(Boolean);
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active);
  const controller = new AbortController();
  for (const s of active) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
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

async function send({ method, path, body, signal }) {
  if (USE_MOCKS) {
    const { mockRequest } = await import('./mocks/index.js');
    return mockRequest({ method, path, body, signal });
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

/**
 * Sends one request and returns the parsed JSON body.
 * Throws ApiError with code from the error envelope, NETWORK_ERROR or TIMEOUT.
 */
export async function request(
  path,
  { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const timeout = startTimeout(timeoutMs);
  const combined = combineSignals([signal, timeout.signal]);

  let response;
  try {
    response = await send({ method, path, body, signal: combined });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.signal.aborted) throw new ApiError(MESSAGE_TIMEOUT, { code: 'TIMEOUT' });
    throw new ApiError(MESSAGE_UNAVAILABLE, { code: 'NETWORK_ERROR' });
  } finally {
    timeout.clear();
  }

  const { status, data } = response;
  const ok = status >= 200 && status < 300;
  if (data === null || data === undefined) {
    // Non-JSON body, for example the dev proxy's 502 while the server is down.
    throw new ApiError(MESSAGE_UNAVAILABLE, { status, code: 'NETWORK_ERROR' });
  }
  if (!ok) {
    throw new ApiError(data?.error?.message ?? MESSAGE_GENERIC, {
      status,
      code: data?.error?.code ?? 'NETWORK_ERROR',
    });
  }
  return data;
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
