import { describe, it, expect } from 'vitest';
import { AppError } from './AppError.js';

describe('AppError', () => {
  it('is an Error carrying status, code and message', () => {
    const err = new AppError(404, 'NOT_FOUND', 'Izazov ne postoji.');
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Izazov ne postoji.');
  });

  it('keeps the original error as cause', () => {
    const original = new Error('db down');
    const err = new AppError(500, 'INTERNAL_ERROR', 'Greska.', {
      cause: original,
    });
    expect(err.cause).toBe(original);
  });

  it('has no cause by default', () => {
    expect(new AppError(400, 'VALIDATION_ERROR', 'x').cause).toBeUndefined();
  });
});
