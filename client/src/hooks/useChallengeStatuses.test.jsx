import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getProgress } from '../api/client.js';
import { challengeStatus, useChallengeStatuses } from './useChallengeStatuses.js';
import { useUser } from './useUser.js';

vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProgress: vi.fn(),
}));
vi.mock('./useUser.js', () => ({ useUser: vi.fn() }));

const USER = { userId: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', displayName: 'dion' };

beforeEach(() => {
  vi.mocked(getProgress).mockReset();
  vi.mocked(useUser).mockReturnValue({ user: USER });
});

describe('challengeStatus', () => {
  it.each([
    [undefined, null],
    [{ bestScore: 70, attempts: 1 }, 'solved'],
    [{ bestScore: 69, attempts: 3 }, 'attempted'],
    [{ bestScore: null, attempts: 1 }, 'attempted'],
  ])('%j -> %s', (entry, status) => {
    expect(challengeStatus(entry)).toBe(status);
  });
});

describe('useChallengeStatuses', () => {
  it('is "guest" without a user and fetches nothing', () => {
    useUser.mockReturnValue({ user: null });
    const { result } = renderHook(() => useChallengeStatuses());
    expect(result.current.status).toBe('guest');
    expect(result.current.byId.size).toBe(0);
    expect(getProgress).not.toHaveBeenCalled();
  });

  it('loads perChallenge into a map by id, dropping malformed entries', async () => {
    getProgress.mockResolvedValue({
      totalScore: 89,
      perChallenge: [
        { challengeId: 'find-max', bestScore: 89, attempts: 2 },
        null,
        { bestScore: 5 },
      ],
    });
    const { result } = renderHook(() => useChallengeStatuses());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.perChallenge).toHaveLength(1);
    expect(result.current.byId.get('find-max').bestScore).toBe(89);
  });

  it('degrades to an empty list on an error', async () => {
    getProgress.mockRejectedValue(new ApiError('down', { code: 'NETWORK_ERROR' }));
    const { result } = renderHook(() => useChallengeStatuses());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.perChallenge).toEqual([]);
  });

  it('treats a response without perChallenge as an error', async () => {
    getProgress.mockResolvedValue({ totalScore: 0 });
    const { result } = renderHook(() => useChallengeStatuses());
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
