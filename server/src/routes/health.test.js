import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
state.db = createFakeSupabase().db;

const { app } = await import('../app.js');

describe('GET /api/health', () => {
  it('returns ok with ai "unavailable" when no LLM key is configured', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      status: 'ok',
      ai: 'unavailable',
      demoMode: false,
    });
  });

  it('does not touch the database', async () => {
    const fake = createFakeSupabase();
    state.db = fake.db;
    await request(app).get('/api/health');
    expect(fake.calls.from).toEqual([]);
  });

  it('does not expose any config secret', async () => {
    const res = await request(app).get('/api/health');
    expect(res.text).not.toContain('test-service-key');
    expect(res.text).not.toContain('localhost:54321');
  });
});
