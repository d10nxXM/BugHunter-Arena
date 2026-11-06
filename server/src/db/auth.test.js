import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The shared service client. Its session methods must never be called.
const shared = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    refreshSession: vi.fn(),
    getUser: vi.fn(),
    admin: { createUser: vi.fn(), deleteUser: vi.fn(), signOut: vi.fn() },
  },
}));
vi.mock('./client.js', () => ({ db: shared }));

// Throwaway anon clients.
const anon = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  refreshSession: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => {
    anon.createClient(...args);
    return {
      auth: {
        signInWithPassword: anon.signInWithPassword,
        refreshSession: anon.refreshSession,
      },
    };
  },
}));

const auth = await import('./auth.js');
const { AuthDbError } = auth;

const SESSION = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_at: 1793980800,
  expires_in: 3600,
};
const USER = { id: 'auth-user-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

async function kindOf(promise) {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(AuthDbError);
    // The Supabase error body never travels with the error.
    expect(err.cause).toBeUndefined();
    return err.kind;
  }
  throw new Error('expected a rejection');
}

describe('throwaway anon client (pitfall: never the shared db client)', () => {
  it('signInWithPassword uses a new anon client per call, no session kept', async () => {
    anon.signInWithPassword.mockResolvedValue({
      data: { user: USER, session: SESSION },
      error: null,
    });
    await auth.signInWithPassword({ email: 'a@b.co', password: 'pw' });
    await auth.signInWithPassword({ email: 'a@b.co', password: 'pw' });
    expect(anon.createClient).toHaveBeenCalledTimes(2);
    const [url, key, options] = anon.createClient.mock.calls[0];
    expect(url).toBe('http://localhost:54321');
    expect(key).toBe('test-anon-key');
    expect(options.auth).toMatchObject({
      persistSession: false,
      autoRefreshToken: false,
    });
    expect(shared.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('refreshSession uses an anon client, never the shared one', async () => {
    anon.refreshSession.mockResolvedValue({
      data: { user: USER, session: SESSION },
      error: null,
    });
    await auth.refreshSession('refresh-1');
    expect(anon.refreshSession).toHaveBeenCalledWith({
      refresh_token: 'refresh-1',
    });
    expect(shared.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('text tripwire: no server source calls a session method on db.auth', () => {
    const src = fileURLToPath(new URL('..', import.meta.url));
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith('.js') && !name.endsWith('.test.js'))
          files.push(path);
      }
    };
    walk(src);
    expect(files.length).toBeGreaterThan(10);
    const bad =
      /\bdb\s*\.\s*auth\s*\.\s*(signInWithPassword|refreshSession|setSession|signUp|signIn\w*|exchangeCodeForSession)\b/;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(bad.test(text), file).toBe(false);
      // Session methods only in db/auth.js, and only on the anon client.
      if (!file.endsWith(join('db', 'auth.js'))) {
        expect(/\.(signInWithPassword|refreshSession)\(/.test(text), file).toBe(
          false,
        );
      }
    }
  });
});

describe('results', () => {
  it('maps the session to { accessToken, refreshToken, expiresAt }', async () => {
    anon.signInWithPassword.mockResolvedValue({
      data: { user: USER, session: SESSION },
      error: null,
    });
    await expect(
      auth.signInWithPassword({ email: 'a@b.co', password: 'pw' }),
    ).resolves.toEqual({
      authUserId: 'auth-user-1',
      session: {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: 1793980800,
      },
    });
  });

  it('createAuthUser confirms the email so none is sent', async () => {
    shared.auth.admin.createUser.mockResolvedValue({
      data: { user: USER },
      error: null,
    });
    await expect(
      auth.createAuthUser({ email: 'a@b.co', password: 'pw' }),
    ).resolves.toBe('auth-user-1');
    expect(shared.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'pw',
      email_confirm: true,
    });
  });

  it('getAuthUser passes the jwt explicitly and returns the id', async () => {
    shared.auth.getUser.mockResolvedValue({
      data: { user: USER },
      error: null,
    });
    await expect(auth.getAuthUser('jwt-1')).resolves.toBe('auth-user-1');
    expect(shared.auth.getUser).toHaveBeenCalledWith('jwt-1');
  });

  it('signOut revokes only this session', async () => {
    shared.auth.admin.signOut.mockResolvedValue({ data: null, error: null });
    await auth.signOut('jwt-1');
    expect(shared.auth.admin.signOut).toHaveBeenCalledWith('jwt-1', 'local');
  });
});

describe('error kinds', () => {
  const apiError = (status, code) => ({
    name: 'AuthApiError',
    status,
    code,
    message: 'secret body with a@b.co',
  });

  it('wrong password is invalid_credentials', async () => {
    anon.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: apiError(400, 'invalid_credentials'),
    });
    expect(
      await kindOf(auth.signInWithPassword({ email: 'x', password: 'y' })),
    ).toBe('invalid_credentials');
  });

  it('existing email is email_taken (code or legacy code)', async () => {
    for (const code of ['email_exists', 'user_already_exists']) {
      shared.auth.admin.createUser.mockResolvedValue({
        data: { user: null },
        error: apiError(422, code),
      });
      expect(
        await kindOf(auth.createAuthUser({ email: 'x', password: 'y' })),
      ).toBe('email_taken');
    }
  });

  it('a bad refresh token or jwt is invalid_token', async () => {
    anon.refreshSession.mockResolvedValue({
      data: { user: null, session: null },
      error: apiError(400, 'refresh_token_not_found'),
    });
    expect(await kindOf(auth.refreshSession('r'))).toBe('invalid_token');
    shared.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: apiError(403, 'bad_jwt'),
    });
    expect(await kindOf(auth.getAuthUser('j'))).toBe('invalid_token');
  });

  it('5xx, network errors and throws are unavailable; 429 is rate_limited', async () => {
    shared.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: apiError(502),
    });
    expect(await kindOf(auth.getAuthUser('j'))).toBe('unavailable');
    shared.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: {
        name: 'AuthRetryableFetchError',
        status: 0,
        message: 'fetch failed',
      },
    });
    expect(await kindOf(auth.getAuthUser('j'))).toBe('unavailable');
    shared.auth.getUser.mockRejectedValue(new TypeError('fetch failed'));
    expect(await kindOf(auth.getAuthUser('j'))).toBe('unavailable');
    shared.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: apiError(429, 'over_request_rate_limit'),
    });
    expect(await kindOf(auth.getAuthUser('j'))).toBe('rate_limited');
  });

  it('a call that hangs past the timeout is timeout', async () => {
    shared.auth.getUser.mockReturnValue(new Promise(() => {}));
    expect(await kindOf(auth.getAuthUser('j', { timeoutMs: 20 }))).toBe(
      'timeout',
    );
    anon.signInWithPassword.mockReturnValue(new Promise(() => {}));
    expect(
      await kindOf(
        auth.signInWithPassword(
          { email: 'x', password: 'y' },
          { timeoutMs: 20 },
        ),
      ),
    ).toBe('timeout');
  });

  it('the default timeout is 5 s', () => {
    expect(auth.AUTH_TIMEOUT_MS).toBe(5000);
  });

  it('the error message never contains the Supabase body', async () => {
    anon.signInWithPassword.mockResolvedValue({
      data: {},
      error: apiError(400, 'invalid_credentials'),
    });
    try {
      await auth.signInWithPassword({ email: 'x', password: 'y' });
    } catch (err) {
      expect(err.message).not.toContain('secret');
      expect(JSON.stringify(err)).not.toContain('a@b.co');
    }
  });
});
