import { describe, it, expect, vi } from 'vitest';
import { notImplemented, NOT_IMPLEMENTED_MESSAGE } from './notImplemented.js';
import { AppError } from '../lib/AppError.js';

describe('notImplemented', () => {
  it('passes a 501 NOT_IMPLEMENTED AppError to next', () => {
    const next = vi.fn();
    notImplemented({}, {}, next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(501);
    expect(err.code).toBe('NOT_IMPLEMENTED');
    expect(err.message).toBe(NOT_IMPLEMENTED_MESSAGE);
  });
});
