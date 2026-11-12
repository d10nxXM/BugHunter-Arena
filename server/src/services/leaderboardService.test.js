import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchRows = vi.hoisted(() => vi.fn());
vi.mock('../db/leaderboard.js', () => ({ fetchLeaderboardRows: fetchRows }));

const {
  rankLeaderboard,
  getLeaderboard,
  getGlobalPosition,
  resetLeaderboardCache,
  CACHE_MS,
  READ_TIMEOUT_MS,
  RETRY_AFTER_MS,
} = await import('./leaderboardService.js');

const row = (handle, total_xp, reached_at, solved = 1) => ({
  handle,
  total_xp,
  solved,
  reached_at,
});

describe('rankLeaderboard', () => {
  it('empty input gives an empty list', () => {
    expect(rankLeaderboard([])).toEqual([]);
  });

  it('orders by XP, then earlier reached_at, then handle; positions are unique', () => {
    const rows = [
      row('zed', 150, '2026-11-06T10:00:00Z'),
      row('amy', 150, '2026-11-06T10:00:00Z'),
      row('bob', 150, '2026-11-05T10:00:00Z'),
      row('top', 290, '2026-11-07T10:00:00Z', 3),
      row('low', 75, '2026-11-01T10:00:00Z'),
    ];
    expect(rankLeaderboard(rows).map((e) => [e.position, e.handle])).toEqual([
      [1, 'top'],
      [2, 'bob'],
      [3, 'amy'],
      [4, 'zed'],
      [5, 'low'],
    ]);
  });

  it('maps to exactly the documented keys, with the rank name', () => {
    const [entry] = rankLeaderboard([
      row('dion_m', '174', '2026-11-06T10:00:00Z', '2'),
    ]);
    expect(entry).toEqual({
      position: 1,
      handle: 'dion_m',
      totalXp: 174,
      rankName: 'Hunter',
      solved: 2,
    });
  });

  it('leaves out accounts with 0 XP and rows without a handle', () => {
    const rows = [
      row('zero', 0, '2026-11-06T10:00:00Z', 0),
      row(null, 100, '2026-11-06T10:00:00Z'),
      row('ok_one', 80, '2026-11-06T10:00:00Z'),
    ];
    expect(rankLeaderboard(rows).map((e) => e.handle)).toEqual(['ok_one']);
  });

  it('a missing or invalid reached_at sorts after a valid one on equal XP', () => {
    const rows = [
      row('aaa', 100, null),
      row('bbb', 100, '2026-11-06T10:00:00Z'),
    ];
    expect(rankLeaderboard(rows).map((e) => e.handle)).toEqual(['bbb', 'aaa']);
  });

  it('never copies other columns from the row', () => {
    const [entry] = rankLeaderboard([
      {
        ...row('dion_m', 90, '2026-11-06T10:00:00Z'),
        id: 'secret-user-id',
        email: 'x@example.com',
      },
    ]);
    expect(Object.keys(entry).sort()).toEqual(
      ['handle', 'position', 'rankName', 'solved', 'totalXp'].sort(),
    );
  });
});

describe('getLeaderboard and getGlobalPosition (cache)', () => {
  beforeEach(() => {
    resetLeaderboardCache();
    fetchRows.mockReset();
    vi.useRealTimers();
  });

  const ROWS = [
    row('first', 200, '2026-11-06T10:00:00Z', 2),
    row('second', 100, '2026-11-06T10:00:00Z'),
    row('third', 90, '2026-11-06T10:00:00Z'),
  ];

  it('returns at most limit entries, the total and updatedAt', async () => {
    fetchRows.mockResolvedValue(ROWS);
    const res = await getLeaderboard(2);
    expect(res.entries.map((e) => e.handle)).toEqual(['first', 'second']);
    expect(res.total).toBe(3);
    expect(Number.isNaN(Date.parse(res.updatedAt))).toBe(false);
  });

  it('reads the database once within the cache window, again after it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T10:00:00Z'));
    fetchRows.mockResolvedValue(ROWS);
    await getLeaderboard(50);
    await getGlobalPosition('second');
    expect(fetchRows).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + CACHE_MS + 1);
    await getLeaderboard(50);
    expect(fetchRows).toHaveBeenCalledTimes(2);
  });

  it('concurrent first requests share one database read', async () => {
    let release;
    fetchRows.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve(ROWS);
      }),
    );
    const a = getLeaderboard(50);
    const b = getGlobalPosition('third');
    release();
    expect((await a).total).toBe(3);
    expect(await b).toBe(3);
    expect(fetchRows).toHaveBeenCalledTimes(1);
  });

  it('a failed read is not cached and propagates', async () => {
    fetchRows.mockRejectedValueOnce(new Error('db down'));
    await expect(getLeaderboard(50)).rejects.toThrow('db down');
    fetchRows.mockResolvedValue(ROWS);
    expect((await getLeaderboard(50)).total).toBe(3);
  });

  it('a read that hangs fails after READ_TIMEOUT_MS and is retried later', async () => {
    vi.useFakeTimers();
    fetchRows.mockReturnValueOnce(new Promise(() => {}));
    const hung = getLeaderboard(50);
    const check = expect(hung).rejects.toThrow('leaderboard read timed out');
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    await check;
    fetchRows.mockResolvedValue(ROWS);
    expect((await getLeaderboard(50)).total).toBe(3);
  });

  it('a failed refresh serves the last good ranking and backs off before retrying', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T10:00:00Z'));
    fetchRows.mockResolvedValueOnce(ROWS);
    const first = await getLeaderboard(50);
    vi.setSystemTime(Date.now() + CACHE_MS + 1);
    fetchRows.mockRejectedValueOnce(new Error('db down'));
    const stale = await getLeaderboard(50);
    expect(stale).toEqual(first);
    expect(fetchRows).toHaveBeenCalledTimes(2);
    // Within the backoff no new read is made.
    await getGlobalPosition('first');
    expect(fetchRows).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + RETRY_AFTER_MS + 1);
    fetchRows.mockResolvedValueOnce([
      row('new_top', 300, '2026-11-12T09:00:00Z', 3),
    ]);
    expect((await getLeaderboard(50)).entries[0].handle).toBe('new_top');
    expect(fetchRows).toHaveBeenCalledTimes(3);
  });

  it('getGlobalPosition: the position, or null when not listed', async () => {
    fetchRows.mockResolvedValue(ROWS);
    expect(await getGlobalPosition('first')).toBe(1);
    expect(await getGlobalPosition('nobody')).toBeNull();
  });
});
