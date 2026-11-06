import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ db: { from: () => ({}) } }));

const { resolveUserId } = await import('./attemptService.js');

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const account = { id: ME, handle: 'me_me' };

describe('resolveUserId truth table', () => {
  it.each([
    ['guest, no userId', undefined, undefined, null],
    ['guest, null', undefined, null, null],
    ['guest, any id', undefined, OTHER, OTHER],
    ['account, omitted', account, undefined, ME],
    ['account, null', account, null, ME],
    ['account, own id', account, ME, ME],
  ])('%s', (_label, acc, supplied, expected) => {
    expect(resolveUserId(acc, supplied)).toBe(expected);
  });

  it('account with another id is 403 FORBIDDEN', () => {
    expect(() => resolveUserId(account, OTHER)).toThrow(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
  });
});
