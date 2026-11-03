import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from './validate.js';
import { errorHandler } from './errorHandler.js';
import { AppError } from '../lib/AppError.js';

const schema = z.object({
  name: z.string().min(2),
  age: z.coerce.number().int().default(18),
});

function run(middleware, req) {
  const next = vi.fn();
  middleware(req, {}, next);
  return { next, arg: next.mock.calls[0]?.[0] };
}

describe('validate', () => {
  it('stores parsed body in req.valid.body and calls next() with no error', () => {
    const req = { body: { name: 'dion' } };
    const { next, arg } = run(validate(schema), req);
    expect(next).toHaveBeenCalledTimes(1);
    expect(arg).toBeUndefined();
    expect(req.valid.body).toEqual({ name: 'dion', age: 18 });
  });

  it('uses the given source and never writes back to req.query', () => {
    const query = { name: 'dion', age: '30' };
    const req = { query };
    const { arg } = run(validate(schema, 'query'), req);
    expect(arg).toBeUndefined();
    expect(req.valid.query).toEqual({ name: 'dion', age: 30 });
    expect(req.query).toBe(query);
    expect(req.query.age).toBe('30');
  });

  it('keeps results of other sources', () => {
    const req = { params: { name: 'ab' }, body: { name: 'cd' } };
    run(validate(schema, 'params'), req);
    run(validate(schema, 'body'), req);
    expect(req.valid.params.name).toBe('ab');
    expect(req.valid.body.name).toBe('cd');
  });

  it('passes a 400 VALIDATION_ERROR AppError to next() on invalid input', () => {
    const req = { body: { name: 'x' } };
    const { next, arg } = run(validate(schema), req);
    expect(next).toHaveBeenCalledTimes(1);
    expect(arg).toBeInstanceOf(AppError);
    expect(arg.status).toBe(400);
    expect(arg.code).toBe('VALIDATION_ERROR');
    expect(arg.message).toBeTypeOf('string');
    expect(arg.message.length).toBeGreaterThan(0);
  });

  it('does not set req.valid[source] on failure', () => {
    const req = { body: { name: 'x' } };
    run(validate(schema), req);
    expect(req.valid?.body).toBeUndefined();
  });

  it('treats a missing body (undefined) as a validation error, not a crash', () => {
    const { arg } = run(validate(schema), {});
    expect(arg).toBeInstanceOf(AppError);
    expect(arg.status).toBe(400);
  });

  it('treats null as a validation error', () => {
    const { arg } = run(validate(schema), { body: null });
    expect(arg.code).toBe('VALIDATION_ERROR');
  });

  it('produces the documented error shape through the error handler', async () => {
    const app = express();
    app.use(express.json());
    app.post('/x', validate(schema), (req, res) => res.json(req.valid.body));
    app.use(errorHandler);

    const bad = await request(app).post('/x').send({ name: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(bad.body.error.message).toBeTypeOf('string');

    const good = await request(app).post('/x').send({ name: 'dion' });
    expect(good.status).toBe(200);
    expect(good.body).toEqual({ name: 'dion', age: 18 });
  });
});
