import { fetchLeaderboardRows } from '../db/leaderboard.js';
import { rankForXp } from './scoringService.js';
import { logger } from '../lib/logger.js';

// docs/SCORING.md, "Leaderboard". The ranking is shared by GET
// /api/leaderboard and the profile's globalPosition.

/** How long a computed ranking is reused. */
export const CACHE_MS = 60_000;

function instant(value) {
  const t = Date.parse(value);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Ranked entries from leaderboard_xp() rows. Pure. Leaves out rows with no
 * handle or 0 XP. Order: XP desc, then earlier reached_at, then handle.
 * Only the documented keys are copied.
 */
export function rankLeaderboard(rows) {
  return rows
    .map((r) => ({
      handle: r.handle,
      totalXp: Number(r.total_xp) || 0,
      solved: Number(r.solved) || 0,
      reachedAt: instant(r.reached_at),
    }))
    .filter((r) => typeof r.handle === 'string' && r.totalXp > 0)
    .sort(
      (a, b) =>
        b.totalXp - a.totalXp ||
        (a.reachedAt === b.reachedAt
          ? 0
          : a.reachedAt < b.reachedAt
            ? -1
            : 1) ||
        // Plain code-unit order: predictable for [a-z0-9_] handles, like SQL's C collation.
        (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0),
    )
    .map((r, i) => ({
      position: i + 1,
      handle: r.handle,
      totalXp: r.totalXp,
      rankName: rankForXp(r.totalXp).name,
      solved: r.solved,
    }));
}

/** A database read that takes longer than this fails (and is not cached). */
export const READ_TIMEOUT_MS = 5_000;

/** After a failed refresh, the stale ranking is served this long before the next try. */
export const RETRY_AFTER_MS = 5_000;

// { at, entries, updatedAt } of the last good read; `at` is when it may be
// refreshed from. `pending` is the read in flight, shared by concurrent
// callers. A failed read is never cached.
let cache = null;
let pending = null;

/** Test helper: forget the cached ranking. */
export function resetLeaderboardCache() {
  cache = null;
  pending = null;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('leaderboard read timed out')),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Fresh ranking: from the cache within CACHE_MS, otherwise one shared read.
 * If the read fails or times out, the last good ranking (however old) is
 * served and the next read waits RETRY_AFTER_MS; with no good ranking yet,
 * the error propagates.
 */
async function ranking() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  if (!pending) {
    pending = withTimeout(fetchLeaderboardRows(), READ_TIMEOUT_MS)
      .then((rows) => {
        const at = Date.now();
        cache = {
          at,
          entries: rankLeaderboard(rows),
          updatedAt: new Date(at).toISOString(),
        };
        return cache;
      })
      .catch((err) => {
        if (!cache) throw err;
        logger.warn(
          {
            route: 'leaderboard',
            reason: 'refresh_failed',
            code: err?.cause?.code,
          },
          'leaderboard refresh failed; serving the last good ranking',
        );
        cache.at = Date.now() - CACHE_MS + RETRY_AFTER_MS;
        return cache;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** GET /api/leaderboard: the top `limit` entries, the total and updatedAt. */
export async function getLeaderboard(limit) {
  const { entries, updatedAt } = await ranking();
  return { entries: entries.slice(0, limit), total: entries.length, updatedAt };
}

/** Position of a handle (1 is the top), or null when it is not listed. */
export async function getGlobalPosition(handle) {
  const { entries } = await ranking();
  return entries.find((e) => e.handle === handle)?.position ?? null;
}
