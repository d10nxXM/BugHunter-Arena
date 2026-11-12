import { AppError } from '../lib/AppError.js';
import { findAccountByHandle } from '../db/users.js';
import { getChallengeMeta, listAttemptSummaries } from '../db/attempts.js';
import { computeProgress } from './attemptService.js';
import { computeXp, rankForXp } from './scoringService.js';
import { getGlobalPosition } from './leaderboardService.js';
import { logger } from '../lib/logger.js';

// Same window as GET /api/progress.
const PROFILE_MAX_ROWS = 1000;
const RECENT_SOLVES = 10;

/** Newest first by instant, ties by challenge id. */
function byNewestSolve(a, b) {
  const diff = Date.parse(b.solvedAt) - Date.parse(a.solvedAt);
  if (diff !== 0 && !Number.isNaN(diff)) return diff;
  return a.challengeId.localeCompare(b.challengeId);
}

/**
 * Public profile from an account, its attempt rows and the challenge meta
 * (docs/DATA_MODEL.md, "Derived data for the profile"). Pure.
 * Never includes explanations, feedback, weak categories, email or auth id.
 */
export function computeProfile(account, rows, meta) {
  const categories = new Map([...meta].map(([id, m]) => [id, m.bugCategory]));
  const progress = computeProgress(rows, categories);
  const { totalXp, byChallenge } = computeXp(rows);

  const bestScores = new Map(
    progress.perChallenge.map((c) => [c.challengeId, c.bestScore]),
  );
  const solves = [];
  const languages = new Map();
  for (const [challengeId, { solvedAt }] of byChallenge) {
    if (solvedAt === null) continue;
    const m = meta.get(challengeId);
    if (!m) continue;
    languages.set(m.language, (languages.get(m.language) ?? 0) + 1);
    solves.push({
      challengeId,
      title: m.title,
      language: m.language,
      difficulty: m.difficulty,
      bestScore: bestScores.get(challengeId) ?? 0,
      solvedAt,
    });
  }

  return {
    handle: account.handle,
    displayName: account.displayName,
    memberSince: account.memberSince,
    rank: rankForXp(totalXp),
    totalXp,
    solved: progress.solved,
    attempted: progress.attempted,
    challengesAvailable: meta.size,
    solvedByLanguage: [...languages]
      .map(([language, solved]) => ({ language, solved }))
      .sort(
        (a, b) => b.solved - a.solved || a.language.localeCompare(b.language),
      ),
    recentSolves: solves.sort(byNewestSolve).slice(0, RECENT_SOLVES),
  };
}

/** GET /api/profiles/:handle. Unknown handles (and guests) are 404. */
export async function getProfile(handle) {
  const account = await findAccountByHandle(handle);
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Hunter not found.');
  const [rows, meta, globalPosition] = await Promise.all([
    listAttemptSummaries(account.id, { limit: PROFILE_MAX_ROWS }),
    getChallengeMeta(),
    positionOrNull(account.handle),
  ]);
  return { ...computeProfile(account, rows, meta), globalPosition };
}

/**
 * The leaderboard position, or null when it cannot be read: the profile must
 * still load if the leaderboard query fails. The failure is logged.
 */
async function positionOrNull(handle) {
  try {
    return await getGlobalPosition(handle);
  } catch (err) {
    logger.warn(
      {
        route: 'profiles',
        reason: 'leaderboard_failed',
        code: err?.cause?.code,
      },
      'leaderboard unavailable; globalPosition is null',
    );
    return null;
  }
}
