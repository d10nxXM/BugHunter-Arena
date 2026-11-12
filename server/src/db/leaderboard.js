import { db } from './client.js';
import { logger } from '../lib/logger.js';

/** PostgREST's default max-rows on Supabase: an rpc result is cut at this. */
export const RPC_ROW_CAP = 1000;

/**
 * One row per account with at least one solve:
 * { handle, total_xp, solved, reached_at }, best first. Computed in SQL by
 * leaderboard_xp() (supabase/migrations/20261112090000_leaderboard.sql),
 * which only the service key may call. A result of RPC_ROW_CAP rows may be
 * cut by PostgREST; that is logged, and the accounts below the cut have no
 * position.
 */
export async function fetchLeaderboardRows() {
  const { data, error } = await db.rpc('leaderboard_xp');
  if (error) throw new Error('fetchLeaderboardRows failed', { cause: error });
  const rows = data ?? [];
  if (rows.length >= RPC_ROW_CAP) {
    logger.warn(
      { route: 'leaderboard', rows: rows.length },
      'leaderboard result may be cut at the PostgREST row cap',
    );
  }
  return rows;
}
