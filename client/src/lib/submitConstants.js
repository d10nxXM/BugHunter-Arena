// Constants for the challenge submit flow: validation limits, DOM ids, Montenegrin messages
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

/** Longest error text the evaluation endpoint accepts. */
export const MAX_ERROR_LENGTH = 200;

/** Id of the edge-case pseudo-test run on the original code and on the reference solution. */
export const EDGE_CASE_TEST_ID = 'edge-case';

export const MESSAGES = {
  attemptMaybeLost: 'Predaja možda nije stigla do servera. Pokušaj ponovo.',
  resultMaybeSaved: 'Rezultat je možda sačuvan, ali ga nismo mogli učitati.',
  interrupted: 'Slanje je prekinuto. Pokušaj ponovo.',
  rateLimited: 'Previše zahtjeva. Sačekaj malo pa pokušaj ponovo.',
  generic: 'Došlo je do greške. Pokušaj ponovo.',
  hintMissing: 'Savjet nije stigao. Pokušaj ponovo.',
  runnerFailed: 'Pokretač testova je prijavio grešku.',
  incompleteResults: 'Rezultati testova nisu potpuni, pa nisu poslati.',
  testsNotRun: 'Testovi nisu pokrenuti, pa rezultat nije poslat.',
  badAttempt: 'Server je vratio neočekivan odgovor na predaju.',
  badEvaluation: 'Server je vratio neočekivanu ocjenu.',
};

/**
 * Submission phases. editable: the answer can still change; busy: a step is running (submit
 * ignores clicks); status: text for the polite live region.
 */
export const PHASES = {
  idle: { editable: true, busy: false, status: '' },
  creating: { editable: false, busy: true, status: 'Šaljem odgovor…' },
  createFailed: { editable: true, busy: false, status: '' },
  testing: { editable: false, busy: true, status: 'Pokrećem sve testove na tvom kodu…' },
  testsFailed: { editable: false, busy: false, status: '' },
  evaluating: {
    editable: false,
    busy: true,
    status: 'Računam bodove i čekam pomoćnu AI procjenu. Ovo može potrajati nekoliko sekundi…',
  },
  evalFailed: { editable: false, busy: false, status: '' },
  recovering: { editable: false, busy: true, status: 'Provjeravam da li je rezultat sačuvan…' },
  recovered: { editable: false, busy: false, status: '' },
  unknown: { editable: false, busy: false, status: '' },
  done: { editable: false, busy: true, status: 'Rezultat je spreman.' },
};
