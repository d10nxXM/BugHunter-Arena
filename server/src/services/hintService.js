import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { getFullChallenge } from '../db/challenges.js';
import * as challengeService from './challengeService.js';
import * as aiService from './aiService.js';
import { getDemoEntry } from './evaluationService.js';

/**
 * Hint for POST /api/challenges/:id/hints: AI when available, otherwise (or on
 * any AI failure) the written hint. Demo mode returns the recorded hint.
 * Throws only what getWrittenHint throws (404 NOT_FOUND, db errors).
 *
 * `onAiCall` is invoked right before the LLM is called (and only then), so the
 * route's aiLimiter keeps the slot; a later fallback to the written hint still
 * counts as an AI call.
 *
 * @param {{ onAiCall?: () => void }} [options]
 * @returns {Promise<{ level: number, hint: string, source: 'ai' | 'written' | 'demo' }>}
 */
export async function getHint(
  challengeId,
  level,
  currentAnswer,
  { onAiCall } = {},
) {
  if (config.demoMode) {
    const hint = getDemoEntry(challengeId)?.hints[level - 1];
    if (hint) return { level, hint, source: 'demo' };
    logger.warn(
      { challengeId, level },
      'no demo hint recorded, using written hint',
    );
  } else if (config.aiStatus === 'available') {
    // Server-side only: the full row is never returned, only the AI hint.
    let challenge = null;
    try {
      challenge = await getFullChallenge(challengeId);
    } catch (err) {
      logger.error(
        { challengeId, level, reason: err?.name },
        'loading the challenge for an AI hint failed, using written hint',
      );
    }
    if (challenge) {
      try {
        onAiCall?.();
        const hint = await aiService.getHint(
          { challenge, currentAnswer },
          level,
        );
        return { level, hint, source: 'ai' };
      } catch (err) {
        const { level: logLevel, fields } = aiService.describeAiFailure(err);
        logger[logLevel](
          { challengeId, level, ...fields },
          'AI hint failed, using written hint',
        );
      }
    }
  }
  return challengeService.getWrittenHint(challengeId, level);
}
