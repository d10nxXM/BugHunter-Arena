import {
  EXPLANATION_MAX,
  EXPLANATION_MIN,
  MAX_FIXED_CODE,
  MAX_SELECTED_LINES,
} from './submitConstants.js';

/**
 * Validates the answer before POST /api/attempts.
 * Returns { errors, edgeCase }: errors maps field -> message (empty when valid);
 * edgeCase is { args, expected } once both edge-case fields parse.
 */
export function validateAnswer({ selectedLines, explanation, edgeArgs, edgeExpected, code }) {
  const errors = {};
  if (selectedLines.length === 0) errors.lines = 'Flag at least one line with the bug.';
  else if (selectedLines.length > MAX_SELECTED_LINES) {
    errors.lines = `You can flag at most ${MAX_SELECTED_LINES} lines.`;
  }

  if (code.length > MAX_FIXED_CODE) {
    errors.code = `The code can have at most ${MAX_FIXED_CODE} characters.`;
  }

  const length = explanation.trim().length;
  if (length < EXPLANATION_MIN) {
    errors.explanation = `The explanation needs at least ${EXPLANATION_MIN} characters.`;
  } else if (length > EXPLANATION_MAX) {
    errors.explanation = `The explanation can have at most ${EXPLANATION_MAX} characters.`;
  }

  let args;
  try {
    if (edgeArgs.trim() === '') throw new Error('empty');
    args = JSON.parse(`[${edgeArgs}]`);
  } catch {
    errors.edgeArgs = 'Enter the arguments as comma-separated JSON values, e.g. [1, 2], 3.';
  }

  let expected;
  try {
    if (edgeExpected.trim() === '') throw new Error('empty');
    expected = JSON.parse(edgeExpected);
  } catch {
    errors.edgeExpected = 'Enter the expected result as a JSON value, e.g. 5, "text" or null.';
  }

  const edgeCase = errors.edgeArgs || errors.edgeExpected ? null : { args, expected };
  return { errors, edgeCase };
}
