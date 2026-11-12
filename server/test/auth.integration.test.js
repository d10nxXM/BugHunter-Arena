import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFakeSupabase } from './fakeSupabase.js';
import { CHALLENGES_DIR, collectKeys } from './fixtures.js';

// Phase 2 accounts over the real app: fake PostgREST tables plus an in-memory
// fake of Supabase Auth behind server/src/db/auth.js.

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../src/db/client.js', () => ({
  db: {
    from: (...args) => state.db.from(...args),
    rpc: (...args) => state.db.rpc(...args),
  },
}));

const gotrue = vi.hoisted(() => ({
  users: new Map(), // email -> { id, password }
  access: new Map(), // access token -> auth user id
  refresh: new Map(), // refresh token -> auth user id
  seq: 0,
  down: false,
}));
vi.mock('../src/db/auth.js', async (importOriginal) => {
  const real = await importOriginal();
  const { AuthDbError } = real;
  const issue = (id) => {
    gotrue.seq += 1;
    const accessToken = `access-token-${gotrue.seq}`;
    const refreshToken = `refresh-token-${gotrue.seq}`;
    gotrue.access.set(accessToken, id);
    gotrue.refresh.set(refreshToken, id);
    return { accessToken, refreshToken, expiresAt: 1793980800 + gotrue.seq };
  };
  const up = () => {
    if (gotrue.down) throw new AuthDbError('timeout');
  };
  return {
    ...real,
    createAuthUser: async ({ email, password }) => {
      up();
      if (gotrue.users.has(email)) throw new AuthDbError('email_taken', 422);
      const id = randomUUID();
      gotrue.users.set(email, { id, password });
      return id;
    },
    deleteAuthUser: async (id) => {
      for (const [email, u] of gotrue.users) {
        if (u.id === id) gotrue.users.delete(email);
      }
    },
    signInWithPassword: async ({ email, password }) => {
      up();
      const u = gotrue.users.get(email);
      if (!u || u.password !== password) {
        throw new AuthDbError('invalid_credentials', 400);
      }
      return { authUserId: u.id, session: issue(u.id) };
    },
    refreshSession: async (token) => {
      up();
      const id = gotrue.refresh.get(token);
      if (!id) throw new AuthDbError('invalid_token', 400);
      gotrue.refresh.delete(token);
      return { authUserId: id, session: issue(id) };
    },
    signOut: async (jwt) => {
      up();
      if (!gotrue.access.has(jwt)) throw new AuthDbError('invalid_token', 401);
    },
    getAuthUser: async (jwt) => {
      up();
      const id = gotrue.access.get(jwt);
      if (!id) throw new AuthDbError('invalid_token', 401);
      return id;
    },
  };
});

const rows = readdirSync(CHALLENGES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    ...JSON.parse(readFileSync(join(CHALLENGES_DIR, f), 'utf8')),
    created_at: '2025-01-01T00:00:00Z',
  }));
const fake = createFakeSupabase({
  tables: { challenges: rows, users: [], attempts: [] },
});
state.db = fake.db;

const { app } = await import('../src/app.js');
const { logger } = await import('../src/lib/logger.js');

// Every log line of this file, to prove no secret is ever logged.
const logged = [];
for (const level of ['fatal', 'error', 'warn', 'info', 'debug', 'trace']) {
  vi.spyOn(logger, level).mockImplementation((...args) => {
    logged.push(args);
  });
}

// Every response body of this file, to prove no email or password leaks.
const bodies = [];
const send = async (req) => {
  const res = await req;
  bodies.push({ status: res.status, url: res.req?.path, text: res.text });
  return res;
};

const envelope = (res, status, code) => {
  expect(res.status).toBe(status);
  expect(Object.keys(res.body)).toEqual(['error']);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe('string');
};

const ALICE = {
  handle: 'Alice_1',
  email: 'Alice@Example.com',
  password: 'alice-password-1',
};
const BOB = {
  handle: 'bob_2',
  email: 'bob@example.com',
  password: 'bob-password-22',
};

const attemptBody = (extra = {}) => ({
  challengeId: 'find-max',
  selectedLines: [2],
  explanation: 'max_value starts at 0 so negative lists return 0.',
  edgeCase: { args: [[-8, -3, -10]], expected: -3 },
  fixedCode: 'def find_max(numbers): return None',
  hintsUsed: 0,
  durationSec: 30,
  ...extra,
});
const EVALUATION = {
  testResults: [{ id: 't1', passed: true }],
  edgeCaseCheck: { originalOutput: 0, referenceOutput: -3 },
};
const OTHER = '44444444-4444-4444-8444-444444444444';

let alice; // signup response body
const bearer = () => ({ Authorization: `Bearer ${alice.session.accessToken}` });

beforeAll(async () => {
  const res = await send(request(app).post('/api/auth/signup').send(ALICE));
  expect(res.status).toBe(201);
  alice = res.body;
});

describe('POST /api/auth/signup', () => {
  it('201 { session, user } with exactly the documented keys', () => {
    expect(Object.keys(alice).sort()).toEqual(['claimed', 'session', 'user']);
    expect(alice.claimed).toBe(false);
    expect(Object.keys(alice.session).sort()).toEqual([
      'accessToken',
      'expiresAt',
      'refreshToken',
    ]);
    expect(Object.keys(alice.user).sort()).toEqual([
      'displayName',
      'handle',
      'id',
      'memberSince',
    ]);
    expect(alice.user.handle).toBe('alice_1');
    expect(alice.user.displayName).toBe('alice_1');
    expect(Number.isInteger(alice.session.expiresAt)).toBe(true);
    // Row written with the auth id and handle, never the email.
    const row = fake.tables.users.find((u) => u.id === alice.user.id);
    expect(row.handle).toBe('alice_1');
    expect(row.auth_user_id).toBeTruthy();
    expect(JSON.stringify(fake.tables.users)).not.toMatch(/example\.com/i);
  });

  it('400, 409 HANDLE_TAKEN, 409 EMAIL_TAKEN', async () => {
    envelope(
      await send(
        request(app)
          .post('/api/auth/signup')
          .send({ ...BOB, password: 'short' }),
      ),
      400,
      'VALIDATION_ERROR',
    );
    envelope(
      await send(
        request(app)
          .post('/api/auth/signup')
          .send({ ...BOB, handle: 'ALICE_1' }),
      ),
      409,
      'HANDLE_TAKEN',
    );
    envelope(
      await send(
        request(app)
          .post('/api/auth/signup')
          .send({ ...BOB, email: 'alice@example.com' }),
      ),
      409,
      'EMAIL_TAKEN',
    );
  });

  it('claims a guest row: same id, its attempts move with it', async () => {
    const guest = await send(
      request(app).post('/api/users').send({ displayName: 'bobby' }),
    );
    const made = await send(
      request(app)
        .post('/api/attempts')
        .send(attemptBody({ userId: guest.body.id })),
    );
    expect(made.status).toBe(201);
    const res = await send(
      request(app)
        .post('/api/auth/signup')
        .send({ ...BOB, claimUserId: guest.body.id }),
    );
    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe(guest.body.id);
    expect(res.body.claimed).toBe(true);
    expect(res.body.user.handle).toBe('bob_2');
    // The guest id now needs Bob's token.
    const progress = await send(
      request(app).get(`/api/progress?userId=${guest.body.id}`),
    );
    expect(progress.body.attempted).toBe(0);
    const own = await send(
      request(app)
        .get('/api/progress')
        .set('Authorization', `Bearer ${res.body.session.accessToken}`),
    );
    expect(own.body.attempted).toBe(1);
  });
});

describe('login, refresh, logout, me', () => {
  it('login 200 with the same shape; wrong password generic 401', async () => {
    const ok = await send(
      request(app)
        .post('/api/auth/login')
        .send({ email: ALICE.email, password: ALICE.password }),
    );
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.body).sort()).toEqual(['session', 'user']);
    expect(ok.body.user).toEqual(alice.user);

    for (const body of [
      { email: ALICE.email, password: 'wrong-password' },
      { email: 'nobody@example.com', password: ALICE.password },
    ]) {
      const bad = await send(request(app).post('/api/auth/login').send(body));
      envelope(bad, 401, 'INVALID_CREDENTIALS');
      expect(bad.body.error.message).toBe('Invalid email or password.');
    }
  });

  it('refresh returns { session } only; a used token is 401', async () => {
    const login = await send(
      request(app)
        .post('/api/auth/login')
        .send({ email: ALICE.email, password: ALICE.password }),
    );
    const { refreshToken } = login.body.session;
    const res = await send(
      request(app).post('/api/auth/refresh').send({ refreshToken }),
    );
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['session']);
    expect(res.body.session.refreshToken).not.toBe(refreshToken);
    envelope(
      await send(request(app).post('/api/auth/refresh').send({ refreshToken })),
      401,
      'UNAUTHORIZED',
    );
    envelope(
      await send(request(app).post('/api/auth/refresh').send({})),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('GET /api/me: 200 with the account, 401 without or with a bad token', async () => {
    const me = await send(request(app).get('/api/me').set(bearer()));
    expect(me.status).toBe(200);
    expect(me.body).toEqual(alice.user);
    envelope(await send(request(app).get('/api/me')), 401, 'UNAUTHORIZED');
    envelope(
      await send(
        request(app).get('/api/me').set('Authorization', 'Bearer nope'),
      ),
      401,
      'UNAUTHORIZED',
    );
    envelope(
      await send(request(app).get('/api/me').set('Authorization', 'Basic abc')),
      401,
      'UNAUTHORIZED',
    );
  });

  it('logout: 204 with a token, 401 without', async () => {
    const res = await send(request(app).post('/api/auth/logout').set(bearer()));
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    envelope(
      await send(request(app).post('/api/auth/logout')),
      401,
      'UNAUTHORIZED',
    );
  });

  it('CORS preflight allows the Authorization header', async () => {
    const res = await request(app)
      .options('/api/me')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(res.headers['access-control-allow-headers']).toMatch(
      /authorization/i,
    );
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('ownership', () => {
  it('guest flow unchanged', async () => {
    const guest = await send(
      request(app).post('/api/users').send({ displayName: 'gina' }),
    );
    const made = await send(
      request(app)
        .post('/api/attempts')
        .send(attemptBody({ userId: guest.body.id })),
    );
    expect(made.status).toBe(201);
    const ev = await send(
      request(app)
        .post(`/api/attempts/${made.body.attemptId}/evaluation`)
        .send(EVALUATION),
    );
    expect(ev.status).toBe(200);
    const list = await send(
      request(app).get(`/api/attempts?userId=${guest.body.id}`),
    );
    expect(list.body).toHaveLength(1);
    envelope(
      await send(request(app).get('/api/progress')),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('token flow stores user_id; userId may be omitted, null or own', async () => {
    for (const userId of [undefined, null, alice.user.id]) {
      const made = await send(
        request(app)
          .post('/api/attempts')
          .set(bearer())
          .send(attemptBody(userId === undefined ? {} : { userId })),
      );
      expect(made.status).toBe(201);
      const stored = fake.tables.attempts.find(
        (a) => a.id === made.body.attemptId,
      );
      expect(stored.user_id).toBe(alice.user.id);
    }
  });

  it('a mismatched userId is 403 and stores nothing', async () => {
    const before = fake.tables.attempts.length;
    envelope(
      await send(
        request(app)
          .post('/api/attempts')
          .set(bearer())
          .send(attemptBody({ userId: OTHER })),
      ),
      403,
      'FORBIDDEN',
    );
    expect(fake.tables.attempts.length).toBe(before);
    envelope(
      await send(
        request(app).get(`/api/progress?userId=${OTHER}`).set(bearer()),
      ),
      403,
      'FORBIDDEN',
    );
    envelope(
      await send(
        request(app).get(`/api/attempts?userId=${OTHER}`).set(bearer()),
      ),
      403,
      'FORBIDDEN',
    );
  });

  it('a bad token is 401 before validation, also on an invalid body', async () => {
    const before = fake.tables.attempts.length;
    envelope(
      await send(
        request(app)
          .post('/api/attempts')
          .set('Authorization', 'Bearer expired')
          .send({}),
      ),
      401,
      'UNAUTHORIZED',
    );
    expect(fake.tables.attempts.length).toBe(before);
    envelope(
      await send(
        request(app)
          .get('/api/progress?userId=abc')
          .set('Authorization', 'Bearer expired'),
      ),
      401,
      'UNAUTHORIZED',
    );
  });

  it('an account id without its token: 404 on attempts, zeros on progress, [] on history', async () => {
    envelope(
      await send(
        request(app)
          .post('/api/attempts')
          .send(attemptBody({ userId: alice.user.id })),
      ),
      404,
      'NOT_FOUND',
    );
    const progress = await send(
      request(app).get(`/api/progress?userId=${alice.user.id}`),
    );
    expect(progress.status).toBe(200);
    expect(progress.body).toEqual({
      totalScore: 0,
      totalXp: 0,
      solved: 0,
      attempted: 0,
      averageDurationSec: 0,
      perChallenge: [],
      weakCategories: [],
    });
    const list = await send(
      request(app).get(`/api/attempts?userId=${alice.user.id}`),
    );
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
  });

  it("evaluating an account's attempt needs that account's token", async () => {
    const made = await send(
      request(app).post('/api/attempts').set(bearer()).send(attemptBody()),
    );
    const url = `/api/attempts/${made.body.attemptId}/evaluation`;
    envelope(
      await send(request(app).post(url).send(EVALUATION)),
      404,
      'NOT_FOUND',
    );
    const ok = await send(
      request(app).post(url).set(bearer()).send(EVALUATION),
    );
    expect(ok.status).toBe(200);
  });

  it('progress with a token and no userId has the XP fields', async () => {
    const res = await send(request(app).get('/api/progress').set(bearer()));
    expect(res.status).toBe(200);
    expect(res.body.attempted).toBe(1);
    expect(typeof res.body.totalXp).toBe('number');
    expect(Object.keys(res.body.perChallenge[0]).sort()).toEqual([
      'attempts',
      'bestScore',
      'challengeId',
      'xp',
    ]);
    const list = await send(request(app).get('/api/attempts').set(bearer()));
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);
  });
});

describe('GET /api/profiles/:handle', () => {
  it('200 with exactly the documented keys, from real data', async () => {
    const res = await send(request(app).get('/api/profiles/Alice_1'));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'attempted',
        'challengesAvailable',
        'displayName',
        'globalPosition',
        'handle',
        'memberSince',
        'rank',
        'recentSolves',
        'solved',
        'solvedByLanguage',
        'totalXp',
      ].sort(),
    );
    expect(res.body.handle).toBe('alice_1');
    expect(res.body.attempted).toBe(1);
    expect(res.body.challengesAvailable).toBe(rows.length);
    expect(Object.keys(res.body.rank).sort()).toEqual([
      'name',
      'nextName',
      'xp',
      'xpToNext',
    ]);
    const keys = collectKeys(res.body);
    for (const hidden of [
      'email',
      'authUserId',
      'auth_user_id',
      'weakCategories',
      'feedback',
      'explanation',
    ]) {
      expect(keys.has(hidden)).toBe(false);
    }
  });

  it('404 for unknown handles; 400 for an invalid one', async () => {
    envelope(
      await send(request(app).get('/api/profiles/nobody_here')),
      404,
      'NOT_FOUND',
    );
    envelope(
      await send(request(app).get('/api/profiles/a-b')),
      400,
      'VALIDATION_ERROR',
    );
  });
});

describe('Supabase Auth down', () => {
  it('503 AUTH_UNAVAILABLE on auth routes and token checks; guests still play', async () => {
    gotrue.down = true;
    try {
      envelope(
        await send(
          request(app)
            .post('/api/auth/login')
            .send({ email: ALICE.email, password: ALICE.password }),
        ),
        503,
        'AUTH_UNAVAILABLE',
      );
      envelope(
        await send(request(app).get('/api/me').set(bearer())),
        503,
        'AUTH_UNAVAILABLE',
      );
      const guest = await send(
        request(app).post('/api/users').send({ displayName: 'gus' }),
      );
      const made = await send(
        request(app)
          .post('/api/attempts')
          .send(attemptBody({ userId: guest.body.id })),
      );
      expect(made.status).toBe(201);
    } finally {
      gotrue.down = false;
    }
  });
});

describe('tripwires', () => {
  it('no response body contains an email or a password', () => {
    expect(bodies.length).toBeGreaterThan(20);
    for (const { text, url } of bodies) {
      for (const secret of [
        ALICE.email,
        ALICE.email.toLowerCase(),
        BOB.email,
        ALICE.password,
        BOB.password,
      ]) {
        expect(text ?? '', url).not.toContain(secret);
      }
      expect(text ?? '', url).not.toMatch(/"(email|password)"/);
    }
  });

  it('no token, email or password is ever logged', () => {
    const text = JSON.stringify(logged);
    expect(text).not.toMatch(/access-token-|refresh-token-/);
    expect(text).not.toMatch(/example\.com/i);
    expect(text).not.toContain(ALICE.password);
    expect(text).not.toContain(BOB.password);
  });
});

describe('rate limits (last: they use up this file’s counters)', () => {
  it('signup: the 6th request in an hour is 429', async () => {
    // 5 signups so far in this file.
    const res = await request(app).post('/api/auth/signup').send({
      handle: 'carol',
      email: 'carol@example.com',
      password: 'carol-password',
    });
    envelope(res, 429, 'RATE_LIMITED');
  });

  it('login: 10 failed logins per 15 min, then 429', async () => {
    // 3 failed logins so far in this file (two 401, one 503); successful
    // ones are not counted.
    const bad = { email: ALICE.email, password: 'wrong-password' };
    for (let i = 0; i < 7; i += 1) {
      expect(
        (await request(app).post('/api/auth/login').send(bad)).status,
      ).toBe(401);
    }
    envelope(
      await request(app).post('/api/auth/login').send(bad),
      429,
      'RATE_LIMITED',
    );
  });
});
