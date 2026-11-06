import { AppError } from '../lib/AppError.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { getFullChallenge } from '../db/challenges.js';
import {
  FK_VIOLATION,
  completeEvaluation,
  getAttemptForEvaluation,
  getChallengeCategories,
  insertAttempt,
  listAttemptSummaries,
} from '../db/attempts.js';
import { findUserById } from '../db/users.js';
import {
  SOLVED_MIN_SCORE,
  calculateScore,
  computeXp,
  countPassedTests,
} from './scoringService.js';
import { evaluateExplanation } from './evaluationService.js';
import { evaluateWithKeywords } from './fallbackService.js';
import { EvaluationResultSchema } from '../schemas/aiOutput.js';

// Never log: explanation, edgeCase and fixedCode are student text.

const MAX_INT4 = 2147483647;
// Margin on top of AI_TIMEOUT_MS for the outer guard around the evaluation.
const AI_GUARD_MARGIN_MS = 1000;
// GET /api/progress reads at most this many attempts of one user.
const PROGRESS_MAX_ROWS = 1000;

const NOT_FOUND_CHALLENGE = 'Challenge not found.';
const NOT_FOUND_USER = 'User not found.';
const NOT_FOUND_ATTEMPT = 'Attempt not found.';

/**
 * Runs evaluateExplanation under a timeout. Any throw, rejection, hang or
 * invalid result becomes the keyword fallback (fallbackService). Never rejects.
 */
export async function evaluateWithFallback(
  context,
  {
    timeoutMs = config.aiTimeoutMs + AI_GUARD_MARGIN_MS,
    evaluate = evaluateExplanation,
  } = {},
) {
  const TIMED_OUT = Symbol('timeout');
  let timer;
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    timer.unref?.();
  });
  // Log fields: a fixed kind (timeout, invalid_result, evaluate_threw) and,
  // for invalid_result, the issue paths only. Never values or student text.
  let failure;
  try {
    const raw = await Promise.race([
      Promise.resolve().then(() => evaluate(context)),
      guard,
    ]);
    if (raw === TIMED_OUT) {
      failure = { reason: 'timeout' };
    } else {
      const parsed = EvaluationResultSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
      failure = {
        reason: 'invalid_result',
        paths: parsed.error.issues.map((issue) => issue.path.join('.')),
      };
    }
  } catch {
    failure = { reason: 'evaluate_threw' };
  } finally {
    clearTimeout(timer);
  }
  logger.warn(
    { route: 'evaluation', attemptId: context?.attemptId, ...failure },
    'evaluation failed, using fallback',
  );
  return { source: 'fallback', ...evaluateWithKeywords(context) };
}

/**
 * The user id a request acts as (docs/API.md, Authentication). With an
 * account (verified token), `suppliedUserId` may be null/undefined or the
 * account's own id; anything else is 403. Without one, the supplied id is
 * returned as is (callers then treat account ids as unknown). Pure.
 */
export function resolveUserId(account, suppliedUserId) {
  if (!account) return suppliedUserId ?? null;
  if (suppliedUserId == null || suppliedUserId === account.id) {
    return account.id;
  }
  throw new AppError(
    403,
    'FORBIDDEN',
    'This user id does not belong to your account.',
  );
}

/**
 * User id for GET /api/progress and GET /api/attempts, or null when the
 * result must be empty (a guest request naming an account's id). Without a
 * token, `userId` is required.
 */
async function resolveReadUserId(account, suppliedUserId) {
  const userId = resolveUserId(account, suppliedUserId);
  if (account) return userId;
  if (!userId) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Invalid value in field "userId".',
    );
  }
  const user = await findUserById(userId);
  return user?.isAccount ? null : userId;
}

/**
 * Stores and locks the attempt, then returns the response of
 * POST /api/attempts. The full challenge is loaded here and nowhere else in
 * the request path; tests and solution leave only after the insert succeeded.
 * `account` is the verified account (optionalAuth), if any.
 */
export async function createAttempt(input, { account } = {}) {
  const userId = resolveUserId(account, input.userId);
  const challenge = await getFullChallenge(input.challengeId);
  if (!challenge) throw new AppError(404, 'NOT_FOUND', NOT_FOUND_CHALLENGE);
  if (userId && !account) {
    // Without a token an account's id is treated like an unknown user.
    const user = await findUserById(userId);
    if (!user || user.isAccount) {
      throw new AppError(404, 'NOT_FOUND', NOT_FOUND_USER);
    }
  }

  let attemptId;
  try {
    attemptId = await insertAttempt({
      challenge_id: input.challengeId,
      user_id: userId,
      selected_lines: input.selectedLines,
      explanation: input.explanation,
      edge_case: input.edgeCase,
      fixed_code: input.fixedCode,
      hints_used: input.hintsUsed,
      duration: Math.min(Math.round(input.durationSec), MAX_INT4),
    });
  } catch (err) {
    if (userId && err?.cause?.code === FK_VIOLATION) {
      throw new AppError(404, 'NOT_FOUND', NOT_FOUND_USER, { cause: err });
    }
    throw err;
  }

  return {
    attemptId,
    tests: (Array.isArray(challenge.tests_json)
      ? challenge.tests_json
      : []
    ).map((t) => ({
      id: t.id,
      args: t.args,
      expected: t.expected,
      visible: t.visible === true,
    })),
    referenceSolution: challenge.reference_solution,
  };
}

/**
 * POST /api/attempts/:id/evaluation. `onAiCall` is passed down to the
 * evaluation chain (called right before an LLM call); the other options go
 * to evaluateWithFallback. `account` is the verified account, if any: an
 * attempt owned by an account is 404 without that account's token.
 */
export async function evaluateAttempt(
  attemptId,
  { testResults, edgeCaseCheck },
  { onAiCall, account, ...guardOptions } = {},
) {
  const row = await getAttemptForEvaluation(attemptId);
  if (!row) throw new AppError(404, 'NOT_FOUND', NOT_FOUND_ATTEMPT);
  if (row.user_id && row.user_id !== account?.id) {
    const owner = await findUserById(row.user_id);
    if (owner?.isAccount) {
      throw new AppError(404, 'NOT_FOUND', NOT_FOUND_ATTEMPT);
    }
  }
  if (row.status === 'evaluated') throw alreadyEvaluated();

  const challenge = await getFullChallenge(row.challenge_id);
  if (!challenge)
    throw new Error(
      `attempt ${attemptId} references missing challenge ${row.challenge_id}`,
    );

  const attempt = {
    selectedLines: row.selected_lines,
    edgeCase: row.edge_case,
    fixedCode: row.fixed_code,
    hintsUsed: row.hints_used,
  };
  const { testsPassed, testsTotal } = countPassedTests(
    testResults,
    challenge.tests_json,
  );

  // Two concurrent evaluations of one attempt may both call the AI; the loser
  // gets 409 at the conditional update. Cost is bounded by aiLimiter.
  const result = await evaluateWithFallback(
    {
      attemptId,
      challenge,
      answer: {
        selectedLines: attempt.selectedLines,
        explanation: row.explanation,
        edgeCase: attempt.edgeCase,
        fixedCode: attempt.fixedCode,
      },
      testSummary: { testsPassed, testsTotal },
      onAiCall,
    },
    guardOptions,
  );

  const { total, breakdown } = calculateScore({
    attempt,
    challenge,
    explanationQuality: result.explanation_quality,
    edgeCaseCheck,
    testResults,
  });

  const { source, ...feedback } = result;
  const stored = await completeEvaluation(attemptId, {
    test_results: testResults,
    score: total,
    score_breakdown: breakdown,
    ai_feedback: feedback,
    feedback_source: source,
  });
  if (!stored) throw alreadyEvaluated();

  return {
    score: total,
    breakdown,
    testsPassed,
    testsTotal,
    feedbackSource: source,
    feedback,
  };
}

function alreadyEvaluated() {
  return new AppError(409, 'ALREADY_EVALUATED', 'Attempt already evaluated.');
}

/**
 * Dashboard statistics from attempt rows (docs/DATA_MODEL.md, derived data).
 * Pure. `categories` maps challenge id -> bug category.
 */
export function computeProgress(rows, categories) {
  const byChallenge = new Map();
  for (const row of rows) {
    let entry = byChallenge.get(row.challenge_id);
    if (!entry) {
      entry = { attempts: 0, best: null };
      byChallenge.set(row.challenge_id, entry);
    }
    entry.attempts += 1;
    if (
      row.status === 'evaluated' &&
      (entry.best === null || row.score > entry.best.score)
    ) {
      entry.best = row;
    }
  }

  const xp = computeXp(rows);
  let totalScore = 0;
  let solved = 0;
  let solvedDuration = 0;
  const perChallenge = [];
  for (const [challengeId, { attempts, best }] of byChallenge) {
    const bestScore = best?.score ?? 0;
    totalScore += bestScore;
    if (best && bestScore >= SOLVED_MIN_SCORE) {
      solved += 1;
      solvedDuration += best.duration ?? 0;
    }
    perChallenge.push({
      challengeId,
      bestScore,
      attempts,
      xp: xp.byChallenge.get(challengeId)?.xp ?? 0,
    });
  }
  perChallenge.sort((a, b) => a.challengeId.localeCompare(b.challengeId));

  // A miss: an evaluated attempt that did not fully find the bug line or
  // scored under 70.
  const misses = new Map();
  for (const row of rows) {
    if (row.status !== 'evaluated') continue;
    const category = categories.get(row.challenge_id);
    if (!category) continue;
    const missedLine = (row.score_breakdown?.lineIdentification ?? 0) < 40;
    if (missedLine || row.score < SOLVED_MIN_SCORE) {
      misses.set(category, (misses.get(category) ?? 0) + 1);
    }
  }
  const weakCategories = [...misses]
    .map(([category, count]) => ({ category, misses: count }))
    .sort((a, b) => b.misses - a.misses || a.category.localeCompare(b.category))
    .slice(0, 3);

  return {
    totalScore,
    totalXp: xp.totalXp,
    solved,
    attempted: byChallenge.size,
    averageDurationSec: solved === 0 ? 0 : Math.round(solvedDuration / solved),
    perChallenge,
    weakCategories,
  };
}

/**
 * GET /api/progress. `suppliedUserId` is the query's userId (optional with a
 * token); `account` is the verified account, if any.
 */
export async function getProgress(suppliedUserId, { account } = {}) {
  const userId = await resolveReadUserId(account, suppliedUserId);
  if (!userId) return computeProgress([], new Map());
  const [rows, categories] = await Promise.all([
    listAttemptSummaries(userId, { limit: PROGRESS_MAX_ROWS }),
    getChallengeCategories(),
  ]);
  return computeProgress(rows, categories);
}

/**
 * GET /api/attempts. Summaries only: no answer text, no hidden data. Newest
 * first; `cursor` is the createdAt of the last item of the previous page and
 * `cursorId` its id (composite cursor, no skipped ties). Both are passed
 * through as received, never re-parsed as dates.
 */
export async function listAttempts(
  suppliedUserId,
  { challengeId, limit, cursor, cursorId, account } = {},
) {
  const userId = await resolveReadUserId(account, suppliedUserId);
  if (!userId) return [];
  const rows = await listAttemptSummaries(userId, {
    challengeId,
    limit,
    before: cursor,
    beforeId: cursorId,
  });
  return rows.map((row) => ({
    id: row.id,
    challengeId: row.challenge_id,
    status: row.status,
    score: row.score ?? null,
    breakdown: row.score_breakdown ?? null,
    feedbackSource: row.feedback_source ?? null,
    hintsUsed: row.hints_used,
    durationSec: row.duration ?? null,
    createdAt: row.created_at,
  }));
}
