import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_STORAGE_KEY,
  readSession,
  subscribeSession,
  writeSession,
} from '../lib/session.js';
import * as api from './client.js';
import { ApiError, REFRESH_MARGIN_SEC } from './client.js';
import * as f from './mocks/fixtures.js';

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const nowSec = () => Math.floor(Date.now() / 1000);

function storeSession({
  expiresIn = 3600,
  accessToken = 'token-a',
  refreshToken = 'refresh-a',
} = {}) {
  return writeSession({
    accessToken,
    refreshToken,
    expiresAt: nowSec() + expiresIn,
    user: f.accountUser,
  });
}

let fetchMock;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function callsTo(path) {
  return fetchMock.mock.calls.filter(([url]) => url === path);
}

function authHeader(call) {
  return call[1].headers?.Authorization;
}

describe('bearer header', () => {
  it('is attached when a session exists', async () => {
    storeSession();
    fetchMock.mockResolvedValue(jsonResponse(200, f.challengeList));
    await api.getChallenges();
    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer token-a');
  });

  it('is left out without a session (guest)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, f.challengeList));
    await api.getChallenges();
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });

  it('is sent with JSON bodies next to Content-Type', async () => {
    storeSession();
    fetchMock.mockResolvedValue(jsonResponse(201, f.attemptCreated));
    await api.createAttempt(f.attemptRequest);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-a',
    });
  });

  it('is never sent to the auth endpoints or the public profile', async () => {
    storeSession();
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        jsonResponse(200, url.startsWith('/api/profiles/') ? f.profile : f.authResponse),
      ),
    );
    await api.login(f.loginRequest);
    await api.signup(f.signupRequest);
    await api.getProfile('null_pointer');
    for (const call of fetchMock.mock.calls) expect(authHeader(call)).toBeUndefined();
  });
});

describe('auth functions', () => {
  it('signup posts handle, email and password, and claimUserId only when given', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(201, f.authResponse));
    await expect(api.signup(f.signupRequest)).resolves.toEqual(f.authResponse);
    let [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/signup');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(f.signupRequest);

    await api.signup({ ...f.signupRequest, claimUserId: f.userCreated.id });
    [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(init.body)).toEqual({ ...f.signupRequest, claimUserId: f.userCreated.id });
  });

  it('login posts email and password', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, f.authResponse));
    await expect(api.login(f.loginRequest)).resolves.toEqual(f.authResponse);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(JSON.parse(init.body)).toEqual(f.loginRequest);
  });

  it('login failure is an ApiError with the server code and does not touch a session', async () => {
    storeSession();
    fetchMock.mockResolvedValue(jsonResponse(401, f.errorInvalidCredentials));
    await expect(api.login(f.loginRequest)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(readSession()).not.toBeNull();
  });

  it('refreshSession posts the refresh token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, f.refreshResponse));
    await expect(api.refreshSession('mock-refresh-token')).resolves.toEqual(f.refreshResponse);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/refresh');
    expect(JSON.parse(init.body)).toEqual(f.refreshRequest);
  });

  it('logout sends the given token and resolves null on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.logout('token-x')).resolves.toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer token-x' });
  });

  it('getMe and getProfile use their paths; the handle is encoded', async () => {
    storeSession();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, f.me));
    await expect(api.getMe()).resolves.toEqual(f.me);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me');
    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer token-a');

    fetchMock.mockResolvedValueOnce(jsonResponse(404, f.errorProfileNotFound));
    await expect(api.getProfile('a/b')).rejects.toMatchObject({ status: 404 });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/profiles/a%2Fb');
  });
});

describe('proactive refresh', () => {
  it('refreshes a token that expires within the margin, once for concurrent requests', async () => {
    storeSession({ expiresIn: REFRESH_MARGIN_SEC - 10 });
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(async (url) => {
      if (url === '/api/auth/refresh') {
        await gate;
        return jsonResponse(200, {
          session: {
            accessToken: 'token-b',
            refreshToken: 'refresh-b',
            expiresAt: nowSec() + 3600,
          },
        });
      }
      return jsonResponse(200, f.challengeList);
    });

    const requests = [api.getChallenges(), api.getHealth(), api.getChallenge('find-max')];
    await vi.waitFor(() => expect(callsTo('/api/auth/refresh')).toHaveLength(1));
    release();
    await Promise.all(requests);

    expect(callsTo('/api/auth/refresh')).toHaveLength(1);
    const refreshBody = JSON.parse(callsTo('/api/auth/refresh')[0][1].body);
    expect(refreshBody).toEqual({ refreshToken: 'refresh-a' });
    const others = fetchMock.mock.calls.filter(([url]) => url !== '/api/auth/refresh');
    expect(others).toHaveLength(3);
    for (const call of others) expect(authHeader(call)).toBe('Bearer token-b');
    expect(readSession()).toMatchObject({
      accessToken: 'token-b',
      refreshToken: 'refresh-b',
      user: { id: f.accountUser.id, handle: f.accountUser.handle },
    });
  });

  it('does not refresh a token with time left', async () => {
    storeSession({ expiresIn: REFRESH_MARGIN_SEC + 60 });
    fetchMock.mockResolvedValue(jsonResponse(200, f.challengeList));
    await api.getChallenges();
    expect(callsTo('/api/auth/refresh')).toHaveLength(0);
  });

  it('a rejected refresh token clears the session and fails with UNAUTHORIZED', async () => {
    storeSession({ expiresIn: 5 });
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    fetchMock.mockResolvedValue(jsonResponse(401, f.errorUnauthorized));
    await expect(api.getChallenges()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'UNAUTHORIZED',
    });
    unsubscribe();
    expect(readSession()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledWith(null, 'expired');
    // Only the refresh went out.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a network failure while refreshing keeps the session and uses the still-valid token', async () => {
    storeSession({ expiresIn: 30 });
    fetchMock.mockImplementation(async (url) => {
      if (url === '/api/auth/refresh') throw new TypeError('Failed to fetch');
      return jsonResponse(200, f.challengeList);
    });
    await api.getChallenges();
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/challenges');
    expect(authHeader(call)).toBe('Bearer token-a');
    expect(readSession()).not.toBeNull();
  });

  it('a network failure with an already expired token fails without clearing the session', async () => {
    storeSession({ expiresIn: -10 });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.getChallenges()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(readSession()).not.toBeNull();
  });
});

describe('401 on an authenticated request', () => {
  it('clears the session and does not retry', async () => {
    storeSession();
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    fetchMock.mockResolvedValue(jsonResponse(401, f.errorUnauthorized));
    const error = await api.createAttempt(f.attemptRequest).catch((e) => e);
    unsubscribe();
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(readSession()).toBeNull();
    expect(listener).toHaveBeenCalledWith(null, 'expired');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer session that replaced the one the request used', async () => {
    storeSession({ accessToken: 'old-token' });
    fetchMock.mockImplementation(async () => {
      storeSession({ accessToken: 'new-token', refreshToken: 'refresh-new' });
      return jsonResponse(401, f.errorUnauthorized);
    });
    await expect(api.getChallenges()).rejects.toMatchObject({ status: 401 });
    expect(readSession()?.accessToken).toBe('new-token');
  });

  it('403 FORBIDDEN leaves the session alone', async () => {
    storeSession();
    fetchMock.mockResolvedValue(
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'Not yours.' } }),
    );
    await expect(api.getProgress(f.accountUser.id)).rejects.toMatchObject({ status: 403 });
    expect(readSession()).not.toBeNull();
  });
});
