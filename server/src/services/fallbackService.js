/**
 * Keyword-group evaluation without the AI: docs/SCORING.md, "Fallback
 * without the AI". Pure, no I/O. Never logs: the explanation is student text.
 */

/** Groups matched (0-3) -> explanation_quality, from docs/SCORING.md. */
const QUALITY_BY_GROUPS = [0, 3, 7, 10];

export const DEFAULT_FALLBACK_FEEDBACK =
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
 * @param {object} context `{ challenge, answer }` as passed to evaluateExplanation.
 * @returns the seven feedback fields (no `source`).
 */
export function evaluateWithKeywords(context = {}) {
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
    // docs/SCORING.md: is_correct = quality >= 7.
    is_correct: quality >= 7,
    explanation_quality: quality,
    detected_misconception: null,
    needs_clarification: false,
    hint: null,
    feedback,
    practice_tip: null,
  };
}
