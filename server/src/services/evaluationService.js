/**
 * Explanation evaluation chain (error-handling skill): demo -> AI -> keyword
 * fallback. Never rejects: any AI error, timeout or invalid output falls back.
 *
 * Never logs the explanation (student text). `attemptId` is for logs only and
 * is never sent to the LLM.
 */
import { readFileSync } from 'node:fs';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { DemoEntrySchema } from '../schemas/aiOutput.js';
import * as aiService from './aiService.js';
import { evaluateWithKeywords } from './fallbackService.js';

let demoResponses;

/**
 * Recorded responses, validated once, entry by entry: an invalid entry is
 * dropped and logged (error code or schema issue paths only, never values),
 * the valid ones stay. The map has no prototype.
 */
function loadDemoResponses() {
  if (demoResponses !== undefined) return demoResponses;
  demoResponses = Object.create(null);

  let raw;
  try {
    raw = JSON.parse(
      readFileSync(
        new URL('../../data/demo-responses.json', import.meta.url),
        'utf8',
      ),
    );
  } catch (err) {
    logger.error(
      { reason: err?.name, code: err?.code },
      'demo-responses.json could not be read',
    );
    return demoResponses;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    logger.error('demo-responses.json must be an object');
    return demoResponses;
  }
  for (const [id, value] of Object.entries(raw)) {
    const parsed = DemoEntrySchema.safeParse(value);
    if (parsed.success) {
      demoResponses[id] = parsed.data;
    } else {
      logger.error(
        {
          challengeId: id,
          paths: parsed.error.issues.map((issue) => issue.path.join('.')),
        },
        'invalid demo response entry dropped',
      );
    }
  }
  return demoResponses;
}

/** Recorded demo entry for a challenge id, or null. Shared with hintService. */
export function getDemoEntry(challengeId) {
  const responses = loadDemoResponses();
  if (typeof challengeId !== 'string') return null;
  return Object.hasOwn(responses, challengeId) ? responses[challengeId] : null;
}

/**
 * @param {object} context
 * @param {string|null} [context.attemptId] For logs only, never sent to an LLM.
 * @param {object} context.challenge Full challenge row, snake_case as stored.
 * @param {object} context.answer `{ selectedLines, explanation, edgeCase, fixedCode }`.
 * @param {object} [context.testSummary] `{ testsPassed, testsTotal }`.
 * @param {() => void} [context.onAiCall] Called right before the LLM call (and
 *   only then), so aiLimiter keeps the slot. Never passed to aiService.
 * @returns {Promise<{
 *   source: 'ai' | 'fallback' | 'demo',
 *   is_correct: boolean,
 *   explanation_quality: number,
 *   detected_misconception: string | null,
 *   needs_clarification: boolean,
 *   hint: string | null,
 *   feedback: string,
 *   practice_tip: string | null,
 * }>}
 */
export async function evaluateExplanation(context = {}) {
  const challenge = context?.challenge ?? {};

  if (config.demoMode) {
    const entry = getDemoEntry(challenge.id);
    if (entry) return { source: 'demo', ...entry.evaluation };
    logger.warn(
      { attemptId: context?.attemptId },
      'no demo response, using fallback',
    );
  } else if (config.aiStatus === 'available') {
    try {
      context.onAiCall?.();
      const feedback = await aiService.evaluateAnswer({
        challenge,
        answer: context.answer,
        testSummary: context.testSummary,
      });
      return { source: 'ai', ...feedback };
    } catch (err) {
      const { level, fields } = aiService.describeAiFailure(err);
      logger[level](
        { attemptId: context?.attemptId, ...fields },
        'AI evaluation failed, using fallback',
      );
    }
  }

  return { source: 'fallback', ...evaluateWithKeywords(context) };
}
