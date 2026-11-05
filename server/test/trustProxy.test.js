import { afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from './fakeSupabase.js';

// Must be set before config.js is first imported (vi.hoisted runs first).
// Relies on Vitest's default per-file isolation; afterAll removes it anyway.
vi.hoisted(() => {
  process.env.TRUST_PROXY = '1';
});

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../src/db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
state.db = createFakeSupabase().db;

const { app } = await import('../src/app.js');
const { config } = await import('../src/lib/config.js');

/** Remaining requests from the draft-8 `RateLimit` header (`...; r=99; t=600`). */
function remaining(res) {
  const match = /;\s*r=(\d+)/.exec(res.headers.ratelimit ?? '');
  if (!match) throw new Error('missing RateLimit header');
  return Number(match[1]);
}

afterAll(() => {
  delete process.env.TRUST_PROXY;
});

const from = (ip) => request(app).get('/api/health').set('X-Forwarded-For', ip);

describe('TRUST_PROXY=1', () => {
  it('is parsed into config and applied to the app', () => {
    expect(config.trustProxy).toBe(1);
    expect(app.get('trust proxy')).toBe(1);
  });

  it('gives two forwarded client IPs separate rate-limit buckets', async () => {
    const a1 = await from('203.0.113.10');
    const a2 = await from('203.0.113.10');
    const b1 = await from('198.51.100.20');
    expect(a1.status).toBe(200);
    expect(remaining(a2)).toBe(remaining(a1) - 1);
    // B starts its own bucket instead of continuing A's.
    expect(remaining(b1)).toBe(remaining(a1));
  });

  it('uses the closest untrusted hop, not a client-supplied left-most value', async () => {
    // With one trusted hop, req.ip is the right-most X-Forwarded-For entry.
    const first = await from('192.0.2.1, 192.0.2.50');
    const spoofed = await from('192.0.2.99, 192.0.2.50');
    expect(remaining(spoofed)).toBe(remaining(first) - 1);
  });
});
