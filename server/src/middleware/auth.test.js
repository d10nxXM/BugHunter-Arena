import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../lib/AppError.js';

const verify = vi.hoisted(() => vi.fn());
vi.mock('../services/authService.js', () => ({
  verifyAccessToken: verify,
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', 'x'),
}));

const { optionalAuth, requireAuth, parseBearer } = await import('./auth.js');

const ACCOUNT = { id: 'u1', handle: 'dion_m' };

function run(mw, authorization) {
  const req = { headers: authorization === undefined ? {} : { authorization } };
  return new Promise((resolve) => {
    mw(req, {}, (err) => resolve({ err, req }));
  });
}

beforeEach(() => {
  verify.mockReset();
  verify.mockResolvedValue(ACCOUNT);
});

describe('parseBearer', () => {
  it.each([
    [undefined, undefined],
    ['Bearer abc.def.ghi', 'abc.def.ghi'],
    ['bearer abc', 'abc'],
    ['BEARER abc', 'abc'],
    ['Bearer  abc ', 'abc'],
    ['', null],
    ['Bearer', null],
    ['Bearer ', null],
    ['Basic abc', null],
    ['Bearer a b', null],
    ['Bearer <script>', null],
    [`Bearer ${'a'.repeat(5000)}`, null],
  ])('%j -> %j', (header, expected) => {
    expect(parseBearer(header)).toBe(expected);
  });
});

describe('optionalAuth', () => {
  it('no header: guest, no Supabase call', async () => {
    const { err, req } = await run(optionalAuth, undefined);
    expect(err).toBeUndefined();
    expect(req.account).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });

  it('malformed header: 401, never guest', async () => {
    const { err } = await run(optionalAuth, 'Token abc');
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('lowercase bearer with a valid token sets req.account', async () => {
    const { err, req } = await run(optionalAuth, 'bearer good');
    expect(err).toBeUndefined();
    expect(req.account).toEqual(ACCOUNT);
    expect(req.accessToken).toBe('good');
    expect(verify).toHaveBeenCalledWith('good');
  });

  it('valid token with no account row: the 401 from verify is passed on', async () => {
    verify.mockRejectedValue(new AppError(401, 'UNAUTHORIZED', 'x'));
    const { err, req } = await run(optionalAuth, 'Bearer good');
    expect(err).toMatchObject({ status: 401 });
    expect(req.account).toBeUndefined();
  });

  it('Supabase unavailable: the 503 is passed on', async () => {
    verify.mockRejectedValue(new AppError(503, 'AUTH_UNAVAILABLE', 'x'));
    const { err } = await run(optionalAuth, 'Bearer good');
    expect(err).toMatchObject({ status: 503, code: 'AUTH_UNAVAILABLE' });
  });
});

describe('requireAuth', () => {
  it('no header: 401', async () => {
    const { err } = await run(requireAuth, undefined);
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('valid token: sets req.account', async () => {
    const { err, req } = await run(requireAuth, 'Bearer good');
    expect(err).toBeUndefined();
    expect(req.account).toEqual(ACCOUNT);
  });
});
