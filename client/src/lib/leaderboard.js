// Display helpers for the leaderboard (docs/SCORING.md, "Leaderboard").

/** How many entries the leaderboard page shows (the API maximum). */
export const LEADERBOARD_TOP = 100;

/**
 * Where an account stands, from a useGlobalPosition result and the account's current total XP:
 * - { status: 'loading' } or { status: 'error' } while it cannot be told;
 * - { status: 'ranked', position } when it is on the leaderboard;
 * - { status: 'pending' } when it has XP but the server's ranking (cached up to a minute)
 *   does not list it yet;
 * - { status: 'unranked' } when it has no XP.
 */
export function standingOf(positionState, totalXp) {
  if (positionState.status === 'error') return { status: 'error' };
  if (positionState.status !== 'ready') return { status: 'loading' };
  if (positionState.position !== null) {
    return { status: 'ranked', position: positionState.position };
  }
  return totalXp > 0 ? { status: 'pending' } : { status: 'unranked' };
}
