import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('./client.js', () => ({ db: { rpc } }));
const warn = vi.hoisted(() => vi.fn());
vi.mock('../lib/logger.js', () => ({ logger: { warn } }));

const { fetchLeaderboardRows, RPC_ROW_CAP } = await import('./leaderboard.js');

beforeEach(() => {
  rpc.mockReset();
  warn.mockReset();
});

describe('fetchLeaderboardRows', () => {
  it('calls leaderboard_xp and returns its rows', async () => {
    const rows = [{ handle: 'a_b', total_xp: 90, solved: 1, reached_at: 'x' }];
    rpc.mockResolvedValue({ data: rows, error: null });
    expect(await fetchLeaderboardRows()).toEqual(rows);
    expect(rpc).toHaveBeenCalledWith('leaderboard_xp');
    expect(warn).not.toHaveBeenCalled();
  });

  it('null data is an empty list', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchLeaderboardRows()).toEqual([]);
  });

  it('a Supabase error throws with the error as cause', async () => {
    const error = { code: '42883', message: 'function does not exist' };
    rpc.mockResolvedValue({ data: null, error });
    await expect(fetchLeaderboardRows()).rejects.toMatchObject({
      message: 'fetchLeaderboardRows failed',
      cause: error,
    });
  });

  it('warns when the result reaches the PostgREST row cap', async () => {
    const rows = Array.from({ length: RPC_ROW_CAP }, (_, i) => ({
      handle: `h${i}`,
    }));
    rpc.mockResolvedValue({ data: rows, error: null });
    expect(await fetchLeaderboardRows()).toHaveLength(RPC_ROW_CAP);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
