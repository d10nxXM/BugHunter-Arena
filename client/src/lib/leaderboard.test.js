import { describe, expect, it } from 'vitest';
import { standingOf } from './leaderboard.js';

const ready = (position) => ({ status: 'ready', position });

describe('standingOf', () => {
  it('loading, idle and error', () => {
    expect(standingOf({ status: 'loading', position: null }, 0)).toEqual({ status: 'loading' });
    expect(standingOf({ status: 'idle', position: null }, 0)).toEqual({ status: 'loading' });
    expect(standingOf({ status: 'error', position: null }, 50)).toEqual({ status: 'error' });
  });

  it('ranked when the server gives a position', () => {
    expect(standingOf(ready(2), 174)).toEqual({ status: 'ranked', position: 2 });
  });

  it('pending when the account has XP but is not ranked yet (server cache)', () => {
    expect(standingOf(ready(null), 89)).toEqual({ status: 'pending' });
  });

  it('unranked when the account has no XP, however many others are ranked', () => {
    expect(standingOf(ready(null), 0)).toEqual({ status: 'unranked' });
  });
});
