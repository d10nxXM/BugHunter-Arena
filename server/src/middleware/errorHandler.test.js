import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler, notFound } from './errorHandler.js';
import { createLimiter, apiLimiter, aiLimiter } from './rateLimit.js';
import { AppError } from '../lib/AppError.js';

function appThrowing(error) {
  const app = express();
  app.get('/boom', () => {
    throw error;
  });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('renders an AppError with its status, code and message', async () => {
    const err = new AppError(404, 'NOT_FOUND', 'Izazov ne postoji.');
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Izazov ne postoji.' },
    });
  });

  it('maps entity.too.large to 413 PAYLOAD_TOO_LARGE', async () => {
    const err = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
    });
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(res.body.error.message).toBeTypeOf('string');
  });

  it('maps entity.parse.failed to 400 VALIDATION_ERROR', async () => {
    const err = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
      type: 'entity.parse.failed',
      status: 400,
    });
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).not.toContain('Unexpected token');
  });

  it('maps an unknown error to 500 INTERNAL_ERROR without leaking details', async () => {
    const err = new Error(
      'connect ECONNREFUSED secret-host.supabase.co key=abc123',
    );
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.text).not.toContain('ECONNREFUSED');
    expect(res.text).not.toContain('secret-host');
    expect(res.text).not.toContain('abc123');
    expect(res.text).not.toContain('stack');
    expect(res.text).not.toContain('node_modules');
  });

  it('does not leak the cause of an AppError with status 500', async () => {
    const err = new AppError(500, 'INTERNAL_ERROR', 'Greska na serveru.', {
      cause: new Error('db password is hunter2'),
    });
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('hunter2');
  });

  it('hides an AppError 501 behind INTERNAL_ERROR', async () => {
    const err = new AppError(501, 'NOT_IMPLEMENTED', 'internal detail 501');
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.text).not.toContain('internal detail 501');
  });

  it('still hides other 5xx AppErrors behind INTERNAL_ERROR', async () => {
    const err = new AppError(503, 'UNAVAILABLE', 'internal detail xyz');
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.text).not.toContain('xyz');
  });

  it('uses the same fixed message for different unknown errors', async () => {
    const a = await request(appThrowing(new Error('first'))).get('/boom');
    const b = await request(appThrowing(new TypeError('second'))).get('/boom');
    expect(a.body).toEqual(b.body);
  });

  it('handles a rejected promise from an async handler', async () => {
    const app = express();
    app.get('/async', async () => {
      throw new AppError(409, 'ALREADY_EVALUATED', 'Vec ocijenjeno.');
    });
    app.use(errorHandler);
    const res = await request(app).get('/async');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_EVALUATED');
  });

  it('delegates to next(err) when headers were already sent', () => {
    const err = new Error('late');
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() };
    const next = vi.fn();
    errorHandler(err, {}, res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('notFound', () => {
  it('returns 404 NOT_FOUND in the error shape', async () => {
    const res = await request(appThrowing(new Error('x'))).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBeTypeOf('string');
  });
});

describe('rate limiting', () => {
  function limitedApp() {
    const app = express();
    app.use(createLimiter({ windowMs: 60000, limit: 1 }));
    app.get('/ping', (req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    return app;
  }

  it('allows requests up to the limit and then returns 429 RATE_LIMITED', async () => {
    const app = limitedApp();
    const first = await request(app).get('/ping');
    expect(first.status).toBe(200);

    const second = await request(app).get('/ping');
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('RATE_LIMITED');
    expect(second.body.error.message).toBeTypeOf('string');
  });

  it('sends draft-8 standard headers, not legacy X-RateLimit headers', async () => {
    const res = await request(limitedApp()).get('/ping');
    expect(res.headers['ratelimit']).toBeDefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('keeps separate counters per limiter instance', async () => {
    const a = limitedApp();
    const b = limitedApp();
    await request(a).get('/ping');
    const res = await request(b).get('/ping');
    expect(res.status).toBe(200);
  });

  it('exports ready-made apiLimiter and aiLimiter middleware', () => {
    expect(apiLimiter).toBeTypeOf('function');
    expect(aiLimiter).toBeTypeOf('function');
    expect(createLimiter).toBeTypeOf('function');
  });
});
