/**
 * Explanation evaluation. M1 stub: always the keyword fallback from
 * docs/SCORING.md ("Fallback without the AI"), no LLM and no network.
 * Owner: M2 worker C, who adds the demo and AI paths (see the
 * error-handling skill) and may move the keyword logic into fallbackService.
 *
 * Never logs: the explanation is student text.
 */

/** Groups matched (0-3) -> explanation_quality, from docs/SCORING.md. */
const QUALITY_BY_GROUPS = [0, 3, 7, 10];

const DEFAULT_FALLBACK_FEEDBACK =
  'Procjena bez AI-ja: objašnjenje je ocijenjeno prema ključnim pojmovima.';

/** A group matches if the lowercased text contains any non-empty stem. */
function groupMatches(text, group) {
  if (!Array.isArray(group)) return false;
  return group.some(
    (stem) =>
      typeof stem === 'string' &&
      stem.trim() !== '' &&
      text.includes(stem.toLowerCase()),
  );
}

function countMatchedGroups(explanation, keywordGroups) {
  if (typeof explanation !== 'string' || !Array.isArray(keywordGroups)) {
    return 0;
  }
  const text = explanation.toLowerCase();
  const matched = keywordGroups.filter((group) => groupMatches(text, group));
  return Math.min(matched.length, QUALITY_BY_GROUPS.length - 1);
}

/**
 * @param {object} context
 * @param {string|null} [context.attemptId] For logs only, never sent to an LLM.
 * @param {object} context.challenge Full challenge row, snake_case as stored
 *   (`keywords_json`, `fallback_feedback`, `bug_description`, `code`, ...).
 * @param {object} context.answer `{ selectedLines, explanation, edgeCase, fixedCode }`
 *   as validated by POST /api/attempts.
 * @param {object} [context.testSummary] `{ testsPassed, testsTotal }`.
 * @returns {Promise<{
 *   source: 'ai' | 'fallback' | 'demo',
 *   is_correct: boolean,
 *   explanation_quality: number,
 *   detected_misconception: string | null,
 *   needs_clarification: boolean,
 *   hint: string | null,
 *   feedback: string,
 *   practice_tip: string | null,
 * }>} The caller maps `source` to `feedbackSource` and puts the other seven
 *   fields in `feedback` of the evaluation response (docs/API.md).
 *   Never rejects on ordinary input.
 */
export async function evaluateExplanation(context = {}) {
  const challenge = context?.challenge ?? {};
  const explanation = context?.answer?.explanation;

  const groups = countMatchedGroups(explanation, challenge.keywords_json);
  const quality = QUALITY_BY_GROUPS[groups];
  const feedback =
    typeof challenge.fallback_feedback === 'string' &&
    challenge.fallback_feedback.trim() !== ''
      ? challenge.fallback_feedback
      : DEFAULT_FALLBACK_FEEDBACK;

  return {
    source: 'fallback',
    // docs/SCORING.md "Fallback without the AI": is_correct = quality >= 7.
    is_correct: quality >= 7,
    explanation_quality: quality,
    detected_misconception: null,
    needs_clarification: false,
    hint: null,
    feedback,
    practice_tip: null,
  };
}
