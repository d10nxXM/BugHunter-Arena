import { AppError } from '../lib/AppError.js';
import { getPublicChallenge, listPublicChallenges } from '../db/challenges.js';

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
