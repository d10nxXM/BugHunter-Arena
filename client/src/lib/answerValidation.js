import {
  EXPLANATION_MAX,
  EXPLANATION_MIN,
  MAX_FIXED_CODE,
  MAX_SELECTED_LINES,
} from './submitConstants.js';

/**
 * Validates the answer before POST /api/attempts.
 * Returns { errors, edgeCase }: errors maps field -> Montenegrin message (empty when valid);
 * edgeCase is { args, expected } once both edge-case fields parse.
 */
export function validateAnswer({ selectedLines, explanation, edgeArgs, edgeExpected, code }) {
  const errors = {};
  if (selectedLines.length === 0) errors.lines = 'Označi bar jednu liniju sa greškom.';
  else if (selectedLines.length > MAX_SELECTED_LINES) {
    errors.lines = `Možeš označiti najviše ${MAX_SELECTED_LINES} linija.`;
  }

  if (code.length > MAX_FIXED_CODE) {
    errors.code = `Kod može imati najviše ${MAX_FIXED_CODE} karaktera.`;
  }

  const length = explanation.trim().length;
  if (length < EXPLANATION_MIN) {
    errors.explanation = `Objašnjenje mora imati najmanje ${EXPLANATION_MIN} karaktera.`;
  } else if (length > EXPLANATION_MAX) {
    errors.explanation = `Objašnjenje može imati najviše ${EXPLANATION_MAX} karaktera.`;
  }

  let args;
  try {
    if (edgeArgs.trim() === '') throw new Error('empty');
    args = JSON.parse(`[${edgeArgs}]`);
  } catch {
    errors.edgeArgs = 'Unesi argumente kao JSON vrijednosti odvojene zarezom, npr. [1, 2], 3.';
  }

  let expected;
  try {
    if (edgeExpected.trim() === '') throw new Error('empty');
    expected = JSON.parse(edgeExpected);
  } catch {
    errors.edgeExpected = 'Unesi očekivani rezultat kao JSON vrijednost, npr. 5, "tekst" ili null.';
  }

  const edgeCase = errors.edgeArgs || errors.edgeExpected ? null : { args, expected };
  return { errors, edgeCase };
}
