import { AppError } from '../lib/AppError.js';
import {
  getChallengeHints,
  getPublicChallenge,
  listPublicChallenges,
} from '../db/challenges.js';

/**
 * Written hint for `level` (1-3). Throws 404 NOT_FOUND if the challenge is
 * missing. Only { level, hint, source } is returned.
 */
export async function getWrittenHint(id, level) {
  const found = await getChallengeHints(id);
  if (!found) {
    throw new AppError(404, 'NOT_FOUND', 'Izazov ne postoji.');
  }
  const hint = found.hints?.[level - 1];
  if (typeof hint !== 'string' || hint.length === 0) {
    throw new Error(`challenge ${id} has no written hint for level ${level}`);
  }
  return { level, hint, source: 'written' };
}

/** All challenges, public fields only. */
export async function listPublic() {
  return listPublicChallenges();
}

/** One challenge, public fields only. Throws 404 NOT_FOUND if missing. */
export async function getPublic(id) {
  const challenge = await getPublicChallenge(id);
  if (!challenge) {
    throw new AppError(404, 'NOT_FOUND', 'Izazov ne postoji.');
  }
  return challenge;
}
