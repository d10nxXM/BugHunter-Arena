import { describe, it, expect, vi, beforeEach } from 'vitest';

const authDb = vi.hoisted(() => ({
  createAuthUser: vi.fn(),
  deleteAuthUser: vi.fn(),
  signInWithPassword: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  getAuthUser: vi.fn(),
}));
vi.mock('../db/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ...authDb,
}));

const users = vi.hoisted(() => ({
  claimGuestRow: vi.fn(),
  createAccountRow: vi.fn(),
  findAccountByAuthId: vi.fn(),
  findAccountByHandle: vi.fn(),
}));
vi.mock('../db/users.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ...users,
}));

const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../lib/logger.js', () => ({ logger: log }));

const { AuthDbError } = await import('../db/auth.js');
const service = await import('./authService.js');

const SESSION = {
  accessToken: 'access-secret',
  refreshToken: 'refresh-secret',
  expiresAt: 1793980800,
};
const ACCOUNT = {
  id: '6c1f9a0e-2b3d-4e5f-8a9b-0c1d2e3f4a5b',
  handle: 'dion_m',
  displayName: 'dion_m',
  memberSince: '2026-11-06T18:00:00Z',
  authUserId: 'auth-1',
};
const INPUT = {
  handle: 'dion_m',
  email: 'dion@example.com',
  password: 'correct horse',
  claimUserId: null,
};
const GUEST = '11111111-1111-4111-8111-111111111111';

async function errorOf(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected a rejection');
}

function uniqueViolation() {
  return new Error('createAccountRow failed', {
    cause: { code: '23505', message: 'duplicate key' },
  });
}

/** No log call carries a secret, email or token. */
function expectCleanLogs() {
  const text = JSON.stringify([
    ...log.warn.mock.calls,
    ...log.error.mock.calls,
  ]);
  for (const secret of [
    'access-secret',
    'refresh-secret',
    'dion@example.com',
    'correct horse',
  ]) {
    expect(text).not.toContain(secret);
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  users.findAccountByHandle.mockResolvedValue(null);
  authDb.createAuthUser.mockResolvedValue('auth-1');
  authDb.signInWithPassword.mockResolvedValue({
    authUserId: 'auth-1',
    session: SESSION,
  });
  users.createAccountRow.mockResolvedValue(ACCOUNT);
  authDb.deleteAuthUser.mockResolvedValue(undefined);
});

describe('signup', () => {
  it('creates the auth user, the row, logs in, returns { session, user, claimed }', async () => {
    const out = await service.signup(INPUT);
    expect(out).toEqual({
      session: SESSION,
      user: {
        id: ACCOUNT.id,
        handle: 'dion_m',
        displayName: 'dion_m',
        memberSince: '2026-11-06T18:00:00Z',
      },
      claimed: false,
    });
    expect(users.claimGuestRow).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
    expect(out.user).not.toHaveProperty('authUserId');
    expect(users.createAccountRow).toHaveBeenCalledWith({
      authUserId: 'auth-1',
      handle: 'dion_m',
    });
  });

  it('a taken handle is 409 HANDLE_TAKEN before any auth user is created', async () => {
    users.findAccountByHandle.mockResolvedValue(ACCOUNT);
    const err = await errorOf(service.signup(INPUT));
    expect(err).toMatchObject({ status: 409, code: 'HANDLE_TAKEN' });
    expect(authDb.createAuthUser).not.toHaveBeenCalled();
  });

  it('a taken email is 409 EMAIL_TAKEN', async () => {
    authDb.createAuthUser.mockRejectedValue(
      new AuthDbError('email_taken', 422),
    );
    const err = await errorOf(service.signup(INPUT));
    expect(err).toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
    expect(users.createAccountRow).not.toHaveBeenCalled();
  });

  it('rolls the auth user back when the row insert fails', async () => {
    users.createAccountRow.mockRejectedValue(new Error('db down'));
    const err = await errorOf(service.signup(INPUT));
    expect(err.message).toBe('db down');
    expect(authDb.deleteAuthUser).toHaveBeenCalledWith('auth-1');
    expect(authDb.signInWithPassword).not.toHaveBeenCalled();
  });

  it('a unique violation (handle race) rolls back and becomes 409 HANDLE_TAKEN', async () => {
    users.createAccountRow.mockRejectedValue(uniqueViolation());
    const err = await errorOf(service.signup(INPUT));
    expect(err).toMatchObject({ status: 409, code: 'HANDLE_TAKEN' });
    expect(authDb.deleteAuthUser).toHaveBeenCalledWith('auth-1');
  });

  it('a failed rollback is logged without details and the original error still wins', async () => {
    users.createAccountRow.mockRejectedValue(uniqueViolation());
    authDb.deleteAuthUser.mockRejectedValue(new AuthDbError('timeout'));
    const err = await errorOf(service.signup(INPUT));
    expect(err.code).toBe('HANDLE_TAKEN');
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toEqual({
      route: 'auth',
      op: 'deleteAuthUser',
      kind: 'timeout',
      status: undefined,
    });
    expectCleanLogs();
  });

  it('Supabase timeout on create is 503 AUTH_UNAVAILABLE, logged by kind only', async () => {
    authDb.createAuthUser.mockRejectedValue(new AuthDbError('timeout'));
    const err = await errorOf(service.signup(INPUT));
    expect(err).toMatchObject({ status: 503, code: 'AUTH_UNAVAILABLE' });
    expect(log.warn.mock.calls[0][0]).toEqual({
      route: 'auth',
      op: 'createAuthUser',
      kind: 'timeout',
      status: undefined,
    });
    expectCleanLogs();
  });

  it('a misconfigured key (unavailable from db/auth) is 503 with one warn line, never 401', async () => {
    authDb.signInWithPassword.mockRejectedValue(
      new AuthDbError('unavailable', 401),
    );
    const err = await errorOf(
      service.login({ email: INPUT.email, password: 'x' }),
    );
    expect(err).toMatchObject({ status: 503, code: 'AUTH_UNAVAILABLE' });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0][0]).toEqual({
      route: 'auth',
      op: 'signIn',
      kind: 'unavailable',
      status: 401,
    });
    expectCleanLogs();
  });

  it('claims an unclaimed guest row', async () => {
    users.claimGuestRow.mockResolvedValue({ ...ACCOUNT, id: GUEST });
    const out = await service.signup({ ...INPUT, claimUserId: GUEST });
    expect(out.user.id).toBe(GUEST);
    expect(out.claimed).toBe(true);
    expect(users.claimGuestRow).toHaveBeenCalledWith(GUEST, {
      authUserId: 'auth-1',
      handle: 'dion_m',
    });
    expect(users.createAccountRow).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });

  it('a failed claim (missing or already claimed) creates a new row and says claimed: false', async () => {
    users.claimGuestRow.mockResolvedValue(null);
    const out = await service.signup({ ...INPUT, claimUserId: GUEST });
    expect(out.user.id).toBe(ACCOUNT.id);
    expect(out.claimed).toBe(false);
    expect(users.createAccountRow).toHaveBeenCalledTimes(1);
    // One info line: route and outcome only, no ids or email.
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info.mock.calls[0][0]).toEqual({
      route: 'auth',
      claim: 'failed',
    });
    expect(JSON.stringify(log.info.mock.calls)).not.toContain(GUEST);
    expectCleanLogs();
  });

  it('login failing right after signup is 503 (the account exists)', async () => {
    authDb.signInWithPassword.mockRejectedValue(
      new AuthDbError('unavailable', 502),
    );
    const err = await errorOf(service.signup(INPUT));
    expect(err).toMatchObject({ status: 503, code: 'AUTH_UNAVAILABLE' });
    expect(authDb.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('a password GoTrue rejects is 400 VALIDATION_ERROR', async () => {
    authDb.createAuthUser.mockRejectedValue(new AuthDbError('rejected', 422));
    const err = await errorOf(service.signup(INPUT));
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});

describe('login', () => {
  it('returns { session, user }', async () => {
    users.findAccountByAuthId.mockResolvedValue(ACCOUNT);
    const out = await service.login({ email: INPUT.email, password: 'pw' });
    expect(out.session).toEqual(SESSION);
    expect(out.user.handle).toBe('dion_m');
  });

  it('a wrong password is a generic 401 INVALID_CREDENTIALS', async () => {
    authDb.signInWithPassword.mockRejectedValue(
      new AuthDbError('invalid_credentials', 400),
    );
    const err = await errorOf(
      service.login({ email: INPUT.email, password: 'x' }),
    );
    expect(err).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  });

  it('an auth user without an account row gets the same generic 401', async () => {
    users.findAccountByAuthId.mockResolvedValue(null);
    const err = await errorOf(
      service.login({ email: INPUT.email, password: 'x' }),
    );
    expect(err).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
    expectCleanLogs();
  });

  it('Supabase down is 503 AUTH_UNAVAILABLE', async () => {
    authDb.signInWithPassword.mockRejectedValue(new AuthDbError('timeout'));
    const err = await errorOf(
      service.login({ email: INPUT.email, password: 'x' }),
    );
    expect(err).toMatchObject({ status: 503, code: 'AUTH_UNAVAILABLE' });
    expectCleanLogs();
  });

  it('GoTrue rate limit is 429 RATE_LIMITED', async () => {
    authDb.signInWithPassword.mockRejectedValue(
      new AuthDbError('rate_limited', 429),
    );
    const err = await errorOf(
      service.login({ email: INPUT.email, password: 'x' }),
    );
    expect(err).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
  });
});

describe('refresh, logout, verifyAccessToken', () => {
  it('refresh returns { session } only', async () => {
    authDb.refreshSession.mockResolvedValue({
      authUserId: 'auth-1',
      session: SESSION,
    });
    await expect(service.refresh('r')).resolves.toEqual({ session: SESSION });
  });

  it('a bad refresh token is 401 UNAUTHORIZED', async () => {
    authDb.refreshSession.mockRejectedValue(
      new AuthDbError('invalid_token', 400),
    );
    const err = await errorOf(service.refresh('r'));
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('missing anon key (not_configured) is 503', async () => {
    authDb.refreshSession.mockRejectedValue(new AuthDbError('not_configured'));
    const err = await errorOf(service.refresh('r'));
    expect(err).toMatchObject({ status: 503, code: 'AUTH_UNAVAILABLE' });
  });

  it('logout revokes the session', async () => {
    authDb.signOut.mockResolvedValue(undefined);
    await service.logout('jwt');
    expect(authDb.signOut).toHaveBeenCalledWith('jwt');
  });

  it('verifyAccessToken returns the account', async () => {
    authDb.getAuthUser.mockResolvedValue('auth-1');
    users.findAccountByAuthId.mockResolvedValue(ACCOUNT);
    await expect(service.verifyAccessToken('jwt')).resolves.toEqual(ACCOUNT);
  });

  it('a valid token with no account row is 401', async () => {
    authDb.getAuthUser.mockResolvedValue('auth-1');
    users.findAccountByAuthId.mockResolvedValue(null);
    const err = await errorOf(service.verifyAccessToken('jwt'));
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('an invalid token is 401; a timeout is 503', async () => {
    authDb.getAuthUser.mockRejectedValue(new AuthDbError('invalid_token', 401));
    expect((await errorOf(service.verifyAccessToken('jwt'))).status).toBe(401);
    authDb.getAuthUser.mockRejectedValue(new AuthDbError('timeout'));
    expect((await errorOf(service.verifyAccessToken('jwt'))).status).toBe(503);
  });
});
