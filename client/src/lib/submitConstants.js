// Constants for the challenge submit flow: validation limits, DOM ids, messages
// and the submission phase table.

/** Limits from the POST /api/attempts validation (docs/API.md). */
export const EXPLANATION_MIN = 20;
export const EXPLANATION_MAX = 1000;
export const MAX_SELECTED_LINES = 10;
export const MAX_FIXED_CODE = 5000;

/** DOM ids, so the page can move focus to a field, the submit button or the outcome. */
export const FIELD_IDS = {
  lines: 'answer-lines-error',
  explanation: 'answer-explanation',
  edgeArgs: 'answer-edge-args',
  edgeExpected: 'answer-edge-expected',
  code: 'answer-code-error',
};
export const SUBMIT_BUTTON_ID = 'answer-submit';
export const OUTCOME_ID = 'submit-outcome';
export const RECOVERED_HEADING_ID = 'recovered-heading';

/** Order in which invalid fields are focused. */
export const FIELD_ORDER = ['lines', 'code', 'explanation', 'edgeArgs', 'edgeExpected'];

/** Point penalty per hint level (docs/SCORING.md); the server computes the real score. */
export const HINT_PENALTIES = { 1: 5, 2: 5, 3: 10 };

/** Longest error text the evaluation endpoint accepts. */
export const MAX_ERROR_LENGTH = 200;

/** Id of the edge-case pseudo-test run on the original code and on the reference solution. */
export const EDGE_CASE_TEST_ID = 'edge-case';

export const MESSAGES = {
  attemptMaybeLost: 'Your answer may not have reached the server. Please try again.',
  resultMaybeSaved: 'Your result may be saved, but it could not be loaded.',
  resultNotSaved:
    'The result was not saved on the server. Go back to the problems or submit again.',
  interrupted: 'Sending was interrupted. Please try again.',
  rateLimited: 'Too many requests. Wait a moment and try again.',
  generic: 'Something went wrong. Please try again.',
  hintMissing: 'The hint did not arrive. Please try again.',
  runnerFailed: 'The test runner reported an error.',
  incompleteResults: 'The test results are incomplete, so they were not sent.',
  testsNotRun: 'The tests did not run, so the result was not sent.',
  badAttempt: 'The server sent an unexpected response to your answer.',
  badEvaluation: 'The server sent an unexpected result.',
};

/**
 * Submission phases. editable: the answer can still change; busy: a step is running (submit
 * ignores clicks); status: text for the polite live region.
 */
export const PHASES = {
  idle: { editable: true, busy: false, status: '' },
  creating: { editable: false, busy: true, status: 'Sending your answer…' },
  createFailed: { editable: true, busy: false, status: '' },
  testing: { editable: false, busy: true, status: 'Running every test on your code…' },
  testsFailed: { editable: false, busy: false, status: '' },
  evaluating: {
    editable: false,
    busy: true,
    status:
      'Scoring your answer and waiting for the AI-assisted assessment. This can take a few seconds…',
  },
  evalFailed: { editable: false, busy: false, status: '' },
  recovering: { editable: false, busy: true, status: 'Checking whether your result was saved…' },
  recovered: { editable: false, busy: false, status: '' },
  unknown: { editable: false, busy: false, status: '' },
  done: { editable: false, busy: true, status: 'Your result is ready.' },
};
