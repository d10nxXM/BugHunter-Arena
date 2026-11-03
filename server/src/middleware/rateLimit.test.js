import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { config } from '../lib/config.js';
import { errorHandler } from './errorHandler.js';
import { aiCallRecorder, createAiLimiter } from './rateLimit.js';

const original = { ...config };

/**
 * Tiny app with a fresh AI limiter of `limit` 1. `/marked` records an LLM
 * call, `/unmarked` does not, `/abort-marked` records one and then drops the
 * connection without a response (a client disconnecting after the LLM call).
 */
function buildApp() {
  const limiter = createAiLimiter({ limit: 1 });
  const seen = { key: null };
  const app = express();
  app.use(limiter);
  app.use((req, _res, next) => {
    if (req.rateLimit) seen.key = req.rateLimit.key;
    next();
  });
  app.get('/marked', (_req, res) => {
    aiCallRecorder(res)();
    res.json({ ok: true });
  });
  app.get('/unmarked', (_req, res) => res.json({ ok: true }));
  app.get('/abort-marked', (req, res) => {
    aiCallRecorder(res)();
    req.socket.destroy();
  });
  app.use(errorHandler);
  return { app, limiter, seen };
}

beforeEach(() => {
  config.aiStatus = 'available';
});
afterEach(() => {
  Object.assign(config, original);
});

describe('createAiLimiter: reserve up front, give back when no LLM call happened', () => {
  it('refunds requests that did not call the LLM', async () => {
    const { app } = buildApp();
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/unmarked')).status).toBe(200);
    }
  });

  it('keeps the slot of a request that called the LLM', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/marked')).status).toBe(200);
    const over = await request(app).get('/unmarked');
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not refund a request aborted after the LLM call', async () => {
    const { app } = buildApp();
    await request(app)
      .get('/abort-marked')
      .then(
        () => {
          throw new Error('expected the connection to be dropped');
        },
        () => {},
      );
    expect((await request(app).get('/marked')).status).toBe(429);
  });

  it.each(['unavailable', 'demo'])(
    'counts nothing while aiStatus is %s',
    async (status) => {
      config.aiStatus = status;
      const { app } = buildApp();
      for (let i = 0; i < 3; i += 1) {
        expect((await request(app).get('/marked')).status).toBe(200);
      }
    },
  );

  it('a 429 holds no extra slot', async () => {
    const { app, limiter, seen } = buildApp();
    expect((await request(app).get('/marked')).status).toBe(200);
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/unmarked')).status).toBe(429);
    }
    const stored = await limiter.getKey(seen.key);
    expect(stored.totalHits).toBe(1);
  });
});

describe('aiCallRecorder', () => {
  it('returns a function that sets res.locals.aiCalled', () => {
    const res = { locals: {} };
    const record = aiCallRecorder(res);
    expect(res.locals.aiCalled).toBeUndefined();
    record();
    expect(res.locals.aiCalled).toBe(true);
  });
});
