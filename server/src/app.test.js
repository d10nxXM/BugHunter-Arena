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

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-site',
};

function expectSecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(res.headers[name], name).toBe(value);
  }
}
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

describe('app: security headers', () => {
  it('sets them on a 200', async () => {
    const res = await request(app).get('/api/health').set('Origin', ALLOWED);
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  it('sets them on a 404 inside and outside /api', async () => {
    const api = await request(app).get('/api/nope');
    const root = await request(app).get('/nope');
    expect(api.status).toBe(404);
    expect(root.status).toBe(404);
    expectSecurityHeaders(api);
    expectSecurityHeaders(root);
  });

  it('sets them on a 400 from the JSON parser', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');
    expect(res.status).toBe(400);
    expectSecurityHeaders(res);
  });

  it('sets them on a CORS preflight that still grants the allowed origin', async () => {
    const res = await request(app)
      .options('/api/challenges')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expectSecurityHeaders(res);
  });
});

describe('app: trust proxy off by default', () => {
  it('ignores X-Forwarded-For, so forwarded IPs share one rate-limit bucket', async () => {
    const remaining = (res) =>
      Number(/;\s*r=(\d+)/.exec(res.headers.ratelimit)[1]);
    expect(app.get('trust proxy')).toBe(false);
    const a = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', '203.0.113.10');
    const b = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', '198.51.100.20');
    expect(remaining(b)).toBe(remaining(a) - 1);
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

describe('app: GET /healthz (platform health check)', () => {
  it('answers 200 { status: "ok" } with the security headers', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers[name]).toBe(value);
    }
  });

  it('is not rate limited, so frequent platform checks never get 429', async () => {
    for (let i = 0; i < 120; i += 1) {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.headers.ratelimit).toBeUndefined();
    }
  });
});
