import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
const fake = createFakeSupabase({ tables: { users: [] } });
state.db = fake.db;

const { app } = await import('../app.js');

describe('POST /api/users', () => {
  it('creates a user and returns { id, displayName }', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ displayName: '  dion  ' });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['displayName', 'id']);
    expect(res.body.displayName).toBe('dion');
    expect(fake.tables.users[0]).toMatchObject({
      id: res.body.id,
      display_name: 'dion',
    });
  });

  it.each([
    ['too short', { displayName: 'a' }],
    ['too long', { displayName: 'x'.repeat(33) }],
    ['missing', {}],
    ['not a string', { displayName: 5 }],
  ])('400 when the name is %s', async (_n, body) => {
    const res = await request(app).post('/api/users').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('500 with the fixed message when the database fails', async () => {
    const prev = state.db;
    state.db = createFakeSupabase({
      error: { code: 'XX000', message: 'secret detail' },
    }).db;
    try {
      const res = await request(app)
        .post('/api/users')
        .send({ displayName: 'dion' });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.text).not.toContain('secret detail');
    } finally {
      state.db = prev;
    }
  });

  it('accepts 2 and 32 characters', async () => {
    expect(
      (await request(app).post('/api/users').send({ displayName: 'ab' }))
        .status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post('/api/users')
          .send({ displayName: 'x'.repeat(32) })
      ).status,
    ).toBe(201);
  });

  it('leaves GET /api/users unmatched (404)', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
