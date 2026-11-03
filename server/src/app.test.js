import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../test/fakeSupabase.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('./db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
state.db = createFakeSupabase().db;

const { app } = await import('./app.js');

const ALLOWED = 'http://localhost:5173';
const EVIL = 'http://evil.example';

describe('app: unknown routes', () => {
  it('returns 404 NOT_FOUND JSON for an unknown /api route', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 NOT_FOUND JSON outside /api too', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('app: request bodies', () => {
  it('returns 413 PAYLOAD_TOO_LARGE for a JSON body over 50 KB', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ filler: 'x'.repeat(60 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('accepts a JSON body under 50 KB (reaches routing, so 404 here)', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ filler: 'x'.repeat(10 * 1024) }));
    expect(res.status).toBe(404);
  });

  it('returns 400 VALIDATION_ERROR for broken JSON without echoing the parser message', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.text).not.toMatch(/Unexpected|JSON at position/i);
  });
});

describe('app: headers', () => {
  it('does not send x-powered-by on success or on errors', async () => {
    const ok = await request(app).get('/api/health');
    const missing = await request(app).get('/api/nope');
    expect(ok.headers['x-powered-by']).toBeUndefined();
    expect(missing.headers['x-powered-by']).toBeUndefined();
  });
});

describe('app: CORS', () => {
  it('allows the configured origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', ALLOWED);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  it('does not allow another origin and never answers with *', async () => {
    const res = await request(app).get('/api/health').set('Origin', EVIL);
    const header = res.headers['access-control-allow-origin'];
    expect(header).not.toBe(EVIL);
    expect(header).not.toBe('*');
  });

  it('answers a preflight from the configured origin', async () => {
    const res = await request(app)
      .options('/api/challenges')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  it('does not grant a preflight to another origin', async () => {
    const res = await request(app)
      .options('/api/challenges')
      .set('Origin', EVIL)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).not.toBe(EVIL);
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });
});
