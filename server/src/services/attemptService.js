import { z } from 'zod';
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
import { userExists } from '../db/users.js';
import { calculateScore, countPassedTests } from './scoringService.js';
import { evaluateExplanation } from './evaluationService.js';

// Never log: explanation, edgeCase and fixedCode are student text.

const SOLVED_MIN_SCORE = 70;
const MAX_INT4 = 2147483647;
// Margin on top of AI_TIMEOUT_MS for the outer guard around the evaluation.
const AI_GUARD_MARGIN_MS = 1000;
const QUALITY_BY_GROUPS = [0, 3, 7, 10];
const GENERIC_FALLBACK_FEEDBACK =
  'Procjena bez AI-ja: objašnjenje je ocijenjeno prema ključnim pojmovima.';

const NOT_FOUND_CHALLENGE = 'Izazov ne postoji.';
const NOT_FOUND_USER = 'Korisnik ne postoji.';

const AiResultSchema = z.object({
  source: z.enum(['ai', 'fallback', 'demo']),
  is_correct: z.boolean(),
  explanation_quality: z.number().finite().min(0).max(10),
  detected_misconception: z.string().max(500).nullable(),
  needs_clarification: z.boolean(),
  hint: z.string().max(500).nullable(),
  feedback: z.string().min(1).max(2000),
  practice_tip: z.string().max(500).nullable(),
});

/**
 * Minimal non-AI evaluation (docs/SCORING.md "Fallback without the AI"), used
 * only when evaluateExplanation throws, hangs or returns garbage.
 */
export function localFallbackEvaluation(challenge, explanation) {
  const text = typeof explanation === 'string' ? explanation.toLowerCase() : '';
  const groups = Array.isArray(challenge?.keywords_json)
    ? challenge.keywords_json
    : [];
  const matched = groups.filter(
    (group) =>
      Array.isArray(group) &&
      group.some(
        (stem) =>
          typeof stem === 'string' &&
          stem.trim() !== '' &&
          text.includes(stem.toLowerCase()),
      ),
  ).length;
  const quality = QUALITY_BY_GROUPS[Math.min(matched, 3)];
  const stored = challenge?.fallback_feedback;
  return {
    source: 'fallback',
    is_correct: quality >= 7,
    explanation_quality: quality,
    detected_misconception: null,
    needs_clarification: false,
    hint: null,
    feedback:
      typeof stored === 'string' && stored.trim() !== ''
        ? stored
        : GENERIC_FALLBACK_FEEDBACK,
    practice_tip: null,
  };
}

/**
 * Runs evaluateExplanation under a timeout. Any throw, rejection, hang or
 * invalid result becomes the local fallback. Never rejects.
 */
export async function evaluateWithFallback(
  context,
  {
    timeoutMs = config.aiTimeoutMs + AI_GUARD_MARGIN_MS,
    evaluate = evaluateExplanation,
  } = {},
) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('evaluation timed out')),
      timeoutMs,
    );
    timer.unref?.();
  });
  try {
    const raw = await Promise.race([
      Promise.resolve().then(() => evaluate(context)),
      guard,
    ]);
    const parsed = AiResultSchema.safeParse(raw);
    if (!parsed.success) throw new Error('invalid evaluation result');
    return parsed.data;
  } catch (err) {
    logger.warn(
      { route: 'evaluation', attemptId: context.attemptId, reason: err?.name },
      'evaluation failed, using fallback',
    );
    return localFallbackEvaluation(
      context.challenge,
      context.answer?.explanation,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stores and locks the attempt, then returns the response of
 * POST /api/attempts. The full challenge is loaded here and nowhere else in
 * the request path; tests and solution leave only after the insert succeeded.
 */
export async function createAttempt(input) {
  const challenge = await getFullChallenge(input.challengeId);
  if (!challenge) throw new AppError(404, 'NOT_FOUND', NOT_FOUND_CHALLENGE);
  if (input.userId && !(await userExists(input.userId))) {
    throw new AppError(404, 'NOT_FOUND', NOT_FOUND_USER);
  }

  let attemptId;
  try {
    attemptId = await insertAttempt({
      challenge_id: input.challengeId,
      user_id: input.userId,
      selected_lines: input.selectedLines,
      explanation: input.explanation,
      edge_case: input.edgeCase,
      fixed_code: input.fixedCode,
      hints_used: input.hintsUsed,
      duration: Math.min(Math.round(input.durationSec), MAX_INT4),
    });
  } catch (err) {
    if (input.userId && err?.cause?.code === FK_VIOLATION) {
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

/** POST /api/attempts/:id/evaluation. */
export async function evaluateAttempt(
  attemptId,
  { testResults, edgeCaseCheck },
  options,
) {
  const row = await getAttemptForEvaluation(attemptId);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Pokušaj ne postoji.');
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
    },
    options,
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
  return new AppError(409, 'ALREADY_EVALUATED', 'Pokušaj je već ocijenjen.');
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
    perChallenge.push({ challengeId, bestScore, attempts });
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
    solved,
    attempted: byChallenge.size,
    averageDurationSec: solved === 0 ? 0 : Math.round(solvedDuration / solved),
    perChallenge,
    weakCategories,
  };
}

/** GET /api/progress. */
export async function getProgress(userId) {
  const [rows, categories] = await Promise.all([
    listAttemptSummaries(userId),
    getChallengeCategories(),
  ]);
  return computeProgress(rows, categories);
}

/** GET /api/attempts. Summaries only: no answer text, no hidden data. */
export async function listAttempts(userId, challengeId) {
  const rows = await listAttemptSummaries(userId, challengeId);
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
