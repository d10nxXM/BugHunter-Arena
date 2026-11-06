import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './client.js';
import { ApiError, nextAttemptsPage, request } from './client.js';
import * as f from './mocks/fixtures.js';

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** fetch that never answers but rejects when its signal aborts, like the real one. */
function hangingFetch() {
  return vi.fn(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
  );
}

/** fetch whose headers arrive at once but whose body stream errors when the signal aborts. */
function stalledBodyFetch() {
  return vi.fn((_url, { signal }) => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"status":'));
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      },
    });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
  });
}

let fetchMock;
let warnSpy;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1);
  return { url, init, body: init.body === undefined ? undefined : JSON.parse(init.body) };
}

describe('request functions', () => {
  it.each([
    ['getHealth', () => api.getHealth(), '/api/health', f.health],
    ['getChallenges', () => api.getChallenges(), '/api/challenges', f.challengeList],
    [
      'getChallenge',
      () => api.getChallenge('find-max'),
      '/api/challenges/find-max',
      f.findMaxPublic,
    ],
    [
      'getProgress',
      () => api.getProgress('6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'),
      '/api/progress?userId=6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
      f.progress,
    ],
  ])('%s sends GET without a body or Content-Type', async (_name, call, url, data) => {
    fetchMock.mockResolvedValue(jsonResponse(200, data));
    await expect(call()).resolves.toEqual(data);
    const { url: sentUrl, init } = lastCall();
    expect(sentUrl).toBe(url);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('getChallenge encodes the id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, f.errorChallengeNotFound));
    await expect(api.getChallenge('a/b?c')).rejects.toBeInstanceOf(ApiError);
    expect(lastCall().url).toBe('/api/challenges/a%2Fb%3Fc');
  });

  it('requestHint posts level and currentAnswer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, f.hintLevel1));
    await expect(api.requestHint('find-max', f.hintRequest)).resolves.toEqual(f.hintLevel1);
    const { url, init, body } = lastCall();
    expect(url).toBe('/api/challenges/find-max/hints');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(body).toEqual(f.hintRequest);
  });

  it('createAttempt posts the body and returns the 201 data', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, f.attemptCreated));
    await expect(api.createAttempt(f.attemptRequest)).resolves.toEqual(f.attemptCreated);
    const { url, init, body } = lastCall();
    expect(url).toBe('/api/attempts');
    expect(init.method).toBe('POST');
    expect(body).toEqual(f.attemptRequest);
  });

  it('submitEvaluation posts testResults and edgeCaseCheck', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, f.evaluationAi));
    const id = f.attemptCreated.attemptId;
    await expect(api.submitEvaluation(id, f.evaluationRequest)).resolves.toEqual(f.evaluationAi);
    const { url, init, body } = lastCall();
    expect(url).toBe(`/api/attempts/${id}/evaluation`);
    expect(init.method).toBe('POST');
    expect(body).toEqual(f.evaluationRequest);
  });

  it('createUser posts displayName and returns the 201 data', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, f.userCreated));
    await expect(api.createUser('dion')).resolves.toEqual(f.userCreated);
    const { url, init, body } = lastCall();
    expect(url).toBe('/api/users');
    expect(init.method).toBe('POST');
    expect(body).toEqual(f.userRequest);
  });

  it('getAttempts encodes + in the cursor and omits unset params', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, f.attemptsPage));
    const userId = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
    await api.getAttempts({
      userId,
      challengeId: undefined,
      limit: 1,
      cursor: '2026-11-03T10:15:30.123456+00:00',
      cursorId: null,
    });
    const { url, init } = lastCall();
    expect(init.method).toBe('GET');
    expect(url).toBe(
      `/api/attempts?userId=${userId}&limit=1&cursor=2026-11-03T10%3A15%3A30.123456%2B00%3A00`,
    );
    const params = new URL(url, 'http://x').searchParams;
    expect(params.get('cursor')).toBe('2026-11-03T10:15:30.123456+00:00');
    expect(params.has('challengeId')).toBe(false);
    expect(params.has('cursorId')).toBe(false);
  });

  it('getAttempts returns the bare array', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, f.attemptsPage));
    await expect(api.getAttempts({ userId: 'u' })).resolves.toEqual(f.attemptsPage);
  });
});

describe('errors', () => {
  it('turns an error envelope into ApiError with status and code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, f.errorValidation));
    const error = await api.createAttempt(f.attemptRequest).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: f.errorValidation.error.message,
    });
  });

  it.each([
    [404, f.errorChallengeNotFound, 'NOT_FOUND'],
    [409, f.errorAlreadyEvaluated, 'ALREADY_EVALUATED'],
    [429, f.errorRateLimited, 'RATE_LIMITED'],
    [500, f.errorInternal, 'INTERNAL_ERROR'],
  ])('status %i keeps the server code', async (status, envelope, code) => {
    fetchMock.mockResolvedValue(jsonResponse(status, envelope));
    await expect(api.getHealth()).rejects.toMatchObject({
      status,
      code,
      message: envelope.error.message,
    });
  });

  it('a JSON error without an envelope is HTTP_ERROR with the generic message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { oops: true }));
    await expect(api.getHealth()).rejects.toMatchObject({
      status: 500,
      code: 'HTTP_ERROR',
      message: 'Something went wrong talking to the server.',
    });
  });

  it('a non-string envelope message is replaced by the generic one', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: { html: '<b>x</b>' } } }),
    );
    await expect(api.getHealth()).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Something went wrong talking to the server.',
    });
  });

  it.each([502, 503, 504])('a non-JSON %i is NETWORK_ERROR without the URL', async (status) => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status }));
    const error = await api.getChallenge('find-max').catch((e) => e);
    expect(error).toMatchObject({
      status,
      code: 'NETWORK_ERROR',
      message: 'The server is not available right now.',
    });
    expect(error.message).not.toContain('/api');
  });

  it.each([404, 500])('another non-JSON %i is HTTP_ERROR', async (status) => {
    fetchMock.mockResolvedValue(new Response('nope', { status }));
    await expect(api.getHealth()).rejects.toMatchObject({
      status,
      code: 'HTTP_ERROR',
      message: 'Something went wrong talking to the server.',
    });
  });

  it('a 2xx with a non-JSON body is BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValue(new Response('<!doctype html>', { status: 200 }));
    await expect(api.getChallenges()).rejects.toMatchObject({
      status: 200,
      code: 'BAD_RESPONSE',
      message: 'Something went wrong talking to the server.',
    });
  });

  it('a rejected fetch is NETWORK_ERROR with the cause kept', async () => {
    const cause = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(cause);
    const error = await api.getChallenges().catch((e) => e);
    expect(error).toMatchObject({
      name: 'ApiError',
      code: 'NETWORK_ERROR',
      message: 'The server is not available right now.',
    });
    expect(error.cause).toBe(cause);
  });

  it('a body that cannot be serialised is CLIENT_ERROR and nothing is sent', async () => {
    const error = await request('/api/attempts', { method: 'POST', body: { n: 1n } }).catch(
      (e) => e,
    );
    expect(error).toMatchObject({ name: 'ApiError', code: 'CLIENT_ERROR' });
    expect(error.cause).toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('times out after 10 s by default', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    const result = api.getChallenges().catch((e) => e);
    await vi.advanceTimersByTimeAsync(10000);
    const error = await result;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'TIMEOUT',
      message: 'The server is not responding. Please try again.',
    });
  });

  it('evaluation is still pending at 16 s and times out at 20 s', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    let settled = null;
    api
      .submitEvaluation(f.attemptCreated.attemptId, f.evaluationRequest)
      .catch((e) => (settled = e));
    await vi.advanceTimersByTimeAsync(16000);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(4000);
    expect(settled).toMatchObject({ code: 'TIMEOUT' });
  });

  it('hints wait 12 s', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    let settled = null;
    api.requestHint('find-max', { level: 1 }).catch((e) => (settled = e));
    await vi.advanceTimersByTimeAsync(11000);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toMatchObject({ code: 'TIMEOUT' });
  });

  it('a caller abort re-throws the AbortError unchanged', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const controller = new AbortController();
    const result = api.getChallenge('find-max', { signal: controller.signal }).catch((e) => e);
    controller.abort();
    const error = await result;
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error.name).toBe('AbortError');
    expect(error).toBe(controller.signal.reason);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a caller abort while the body is read stays an AbortError', async () => {
    vi.stubGlobal('fetch', stalledBodyFetch());
    const controller = new AbortController();
    const result = api.getHealth({ signal: controller.signal }).catch((e) => e);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    const error = await result;
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error.name).toBe('AbortError');
  });

  it('our timeout while the body is read is TIMEOUT', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stalledBodyFetch());
    const result = api.getHealth().catch((e) => e);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await result).toMatchObject({ name: 'ApiError', code: 'TIMEOUT' });
  });

  it('in dev, warns with method, route and code only', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, f.errorValidation));
    await api.createAttempt(f.attemptRequest).catch(() => {});
    expect(warnSpy).toHaveBeenCalledWith('[api]', 'POST', '/api/attempts', 'VALIDATION_ERROR');
    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain(f.attemptRequest.explanation);

    fetchMock.mockResolvedValue(jsonResponse(404, f.errorChallengeNotFound));
    await api.getProgress('6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b').catch(() => {});
    expect(warnSpy).toHaveBeenLastCalledWith('[api]', 'GET', '/api/progress', 'NOT_FOUND');
  });
});

describe('ApiError', () => {
  it('keeps status, code and cause', () => {
    const cause = new Error('x');
    const error = new ApiError('Poruka.', { status: 500, code: 'HTTP_ERROR', cause });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'ApiError', status: 500, code: 'HTTP_ERROR' });
    expect(error.cause).toBe(cause);
  });
});

describe('nextAttemptsPage', () => {
  it('returns null on a short page', () => {
    expect(nextAttemptsPage(f.attemptsPage, 50)).toBeNull();
    expect(nextAttemptsPage([], 1)).toBeNull();
  });

  it('returns the last item cursor on a full page', () => {
    expect(nextAttemptsPage(f.attemptsPage, 1)).toEqual({
      cursor: '2026-11-03T10:15:30.123456+00:00',
      cursorId: 'a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    });
  });
});

describe('mock mode', () => {
  it('VITE_USE_MOCKS=true answers from the mocks without fetch', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');
    vi.resetModules();
    const mocked = await import('./client.js');
    const { resetMocks } = await import('./mocks/index.js');
    resetMocks();

    await expect(mocked.getChallenge('find-max')).resolves.toEqual(f.findMaxPublic);
    await expect(mocked.getChallenge('nope')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
    });
    const created = await mocked.createAttempt(f.attemptRequest);
    expect(created.tests).toEqual(f.attemptCreated.tests);
    await expect(mocked.submitEvaluation(created.attemptId, f.evaluationRequest)).resolves.toEqual(
      f.evaluationAi,
    );
    await expect(
      mocked.submitEvaluation(created.attemptId, f.evaluationRequest),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_EVALUATED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
