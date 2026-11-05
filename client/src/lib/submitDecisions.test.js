import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client.js';
import {
  evaluationFailureStep,
  needsLookup,
  recoveryStep,
  retryEvaluationStep,
} from './submitDecisions.js';

const USER_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
const timeout = new ApiError('x', { code: 'TIMEOUT' });
const network = new ApiError('x', { code: 'NETWORK_ERROR' });
const serverError = new ApiError('x', { status: 503, code: 'INTERNAL_ERROR' });
const conflict = new ApiError('x', { status: 409, code: 'ALREADY_EVALUATED' });
const rateLimited = new ApiError('x', { status: 429, code: 'RATE_LIMITED' });
const invalid = new ApiError('x', { status: 400, code: 'VALIDATION_ERROR' });
const aborted = new DOMException('aborted', 'AbortError');

describe('needsLookup', () => {
  it.each([
    ['TIMEOUT', timeout],
    ['NETWORK_ERROR', network],
    ['5xx', serverError],
    ['409', conflict],
    ['AbortError', aborted],
  ])('is true after %s', (_, error) => {
    expect(needsLookup(error)).toBe(true);
  });

  it.each([
    ['429', rateLimited],
    ['400', invalid],
    ['a plain Error', new Error('x')],
  ])('is false after %s', (_, error) => {
    expect(needsLookup(error)).toBe(false);
  });
});

describe('evaluationFailureStep', () => {
  it('fails on errors that stored nothing, with or without a user', () => {
    for (const error of [rateLimited, invalid, aborted]) {
      expect(evaluationFailureStep({ error, userId: USER_ID, afterLookup: false })).toBe('fail');
      expect(evaluationFailureStep({ error, userId: null, afterLookup: false })).toBe('fail');
    }
  });

  it('is anonymous for a maybe-saved failure or 409 without a user id', () => {
    expect(evaluationFailureStep({ error: timeout, userId: null, afterLookup: false })).toBe(
      'anonymous',
    );
    expect(evaluationFailureStep({ error: conflict, userId: null, afterLookup: true })).toBe(
      'anonymous',
    );
  });

  it('recovers a maybe-saved failure or 409 with a user id', () => {
    expect(evaluationFailureStep({ error: timeout, userId: USER_ID, afterLookup: false })).toBe(
      'recover',
    );
    expect(evaluationFailureStep({ error: conflict, userId: USER_ID, afterLookup: false })).toBe(
      'recover',
    );
  });

  it('after a lookup, fails on maybe saved but still recovers a 409', () => {
    expect(evaluationFailureStep({ error: timeout, userId: USER_ID, afterLookup: true })).toBe(
      'fail',
    );
    expect(evaluationFailureStep({ error: conflict, userId: USER_ID, afterLookup: true })).toBe(
      'recover',
    );
  });
});

describe('recoveryStep', () => {
  it.each([
    ['aborted', false, 'aborted'],
    ['aborted', true, 'aborted'],
    ['evaluated', false, 'recovered'],
    ['evaluated', true, 'recovered'],
    ['unknown', false, 'unknown'],
    ['unknown', true, 'unknown'],
    ['submitted', false, 'repost'],
    ['submitted', true, 'notSaved'],
  ])('status %s, reposted %s -> %s', (status, reposted, expected) => {
    expect(recoveryStep({ status, reposted })).toBe(expected);
  });
});

describe('retryEvaluationStep', () => {
  it('looks up first with a user id and a possibly stored evaluation', () => {
    expect(retryEvaluationStep({ userId: USER_ID, lookupNeeded: true })).toEqual({
      lookup: true,
      spendRepost: false,
    });
  });

  it('POSTs directly after a known-not-stored failure, without spending the budget', () => {
    expect(retryEvaluationStep({ userId: USER_ID, lookupNeeded: false })).toEqual({
      lookup: false,
      spendRepost: false,
    });
    expect(retryEvaluationStep({ userId: null, lookupNeeded: false })).toEqual({
      lookup: false,
      spendRepost: false,
    });
  });

  it('anonymous after a possibly stored evaluation: POSTs and spends the re-POST budget', () => {
    expect(retryEvaluationStep({ userId: null, lookupNeeded: true })).toEqual({
      lookup: false,
      spendRepost: true,
    });
    expect(retryEvaluationStep({ userId: undefined, lookupNeeded: true })).toEqual({
      lookup: false,
      spendRepost: true,
    });
  });
});
