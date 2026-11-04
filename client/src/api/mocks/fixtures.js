// Fixtures copied from the JSON examples in docs/API.md. mocks.test.js compares each one with the
// doc, so edit the doc first (api-contract skill) and then mirror the change here.
//
// Integrity: only attemptCreated (the POST /api/attempts response) and the evaluation fixtures may
// hold the reference solution or hidden tests (t3, t4). GET and hint fixtures never do.

/** GET /api/health */
export const health = { status: 'ok', ai: 'available', demoMode: false };

/** GET /api/challenges */
export const challengeList = [
  {
    id: 'find-max',
    title: 'Najveći element liste',
    language: 'python',
    difficulty: 'lako',
    bugCategory: 'Pogrešna inicijalizacija',
  },
];

/** GET /api/challenges/find-max */
export const findMaxPublic = {
  id: 'find-max',
  title: 'Najveći element liste',
  description: 'Funkcija find_max vraća najveći broj iz liste. Za praznu listu vraća None.',
  language: 'python',
  difficulty: 'lako',
  bugCategory: 'Pogrešna inicijalizacija',
  functionName: 'find_max',
  code: 'def find_max(numbers):\n    max_value = 0\n    for number in numbers:\n        if number > max_value:\n            max_value = number\n    return max_value',
  visibleTests: [
    { id: 't1', args: [[2, 5, 1]], expected: 5 },
    { id: 't2', args: [[7]], expected: 7 },
  ],
  hintCount: 3,
};

/** POST /api/challenges/:id/hints request */
export const hintRequest = { level: 1, currentAnswer: { selectedLines: [], explanation: '' } };

/** POST /api/challenges/:id/hints response, level 1 (docs/API.md) */
export const hintLevel1 = {
  level: 1,
  hint: 'Da li funkcija radi za svaku listu brojeva, ili samo za uobičajene?',
  source: 'written',
};

// Levels 2 and 3 are not in docs/API.md. Texts are from the hints table in docs/SPEC.md
// (the same as hints_json in server/data/challenges/find-max.json); source 'written'.
export const hintLevel2 = {
  level: 2,
  hint: 'Šta funkcija vraća ako su svi brojevi u listi negativni?',
  source: 'written',
};

export const hintLevel3 = {
  level: 3,
  hint: 'Pogledaj početnu vrijednost promjenljive max_value.',
  source: 'written',
};

/** POST /api/attempts request */
export const attemptRequest = {
  challengeId: 'find-max',
  userId: null,
  selectedLines: [2],
  explanation:
    'max_value počinje od 0. Ako su svi brojevi negativni, nijedan nije veći od 0, pa funkcija vraća 0, a 0 nije u listi.',
  edgeCase: { args: [[-8, -3, -10]], expected: -3 },
  fixedCode:
    'def find_max(numbers):\n    if not numbers:\n        return None\n    max_value = numbers[0]\n    ...',
  hintsUsed: 1,
  durationSec: 184,
};

/** POST /api/attempts response (201). The only fixture with hidden tests and the solution. */
export const attemptCreated = {
  attemptId: 'a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  tests: [
    { id: 't1', args: [[2, 5, 1]], expected: 5, visible: true },
    { id: 't2', args: [[7]], expected: 7, visible: true },
    { id: 't3', args: [[-8, -3, -10]], expected: -3, visible: false },
    { id: 't4', args: [[]], expected: null, visible: false },
  ],
  referenceSolution: 'def find_max(numbers): ...',
};

/** POST /api/attempts/:id/evaluation request */
export const evaluationRequest = {
  testResults: [
    { id: 't1', passed: true, actual: 5 },
    { id: 't2', passed: true, actual: 7 },
    { id: 't3', passed: true, actual: -3 },
    { id: 't4', passed: true, actual: null },
  ],
  edgeCaseCheck: { originalOutput: 0, referenceOutput: -3, error: null },
};

/** POST /api/attempts/:id/evaluation response, AI path (worked example, score 89) */
export const evaluationAi = {
  score: 89,
  breakdown: { lineIdentification: 40, explanation: 24, edgeCase: 20, fix: 10, hintPenalty: -5 },
  testsPassed: 4,
  testsTotal: 4,
  feedbackSource: 'ai',
  feedback: {
    is_correct: true,
    explanation_quality: 8,
    detected_misconception: 'Pretpostavka da lista uvijek sadrži bar jedan pozitivan broj.',
    needs_clarification: false,
    hint: null,
    feedback:
      'Tačno si prepoznao da početna vrijednost 0 pravi problem kada su svi brojevi negativni. Dobro je što si to potvrdio testom [-8, -3, -10]. Za punu ocjenu nedostaje ponašanje za praznu listu.',
    practice_tip:
      'Kada tražiš najveći ili najmanji element, kreni od prvog elementa liste, a ne od proizvoljne konstante.',
  },
};

// Not an API.md example. Derived from docs/SCORING.md "Fallback without the AI" for the same
// answer as attemptRequest. Against find-max's keywords_json its explanation matches only the
// condition group ("negativ"); "počinje" is not the stem "početn", and no fix stem appears.
// 1 group -> quality 3 -> explanation round(3 * 3) = 9, is_correct false;
// total 40 + 9 + 20 + 10 - 5 = 74. feedback is find-max's fallback_feedback.
// mocks.test.js recomputes all of this from server/data/challenges/find-max.json.
export const evaluationFallback = {
  score: 74,
  breakdown: { lineIdentification: 40, explanation: 9, edgeCase: 20, fix: 10, hintPenalty: -5 },
  testsPassed: 4,
  testsTotal: 4,
  feedbackSource: 'fallback',
  feedback: {
    is_correct: false,
    explanation_quality: 3,
    detected_misconception: null,
    needs_clarification: false,
    hint: null,
    feedback:
      'Greška je u početnoj vrijednosti max_value = 0. Ako su svi brojevi negativni, nijedan nije veći od 0, pa funkcija vraća 0, koja nije u listi. Maksimum treba početi od prvog elementa, a praznu listu obraditi posebno.',
    practice_tip: null,
  },
};

/** GET /api/progress?userId= */
export const progress = {
  totalScore: 245,
  solved: 3,
  attempted: 4,
  averageDurationSec: 212,
  perChallenge: [{ challengeId: 'find-max', bestScore: 89, attempts: 2 }],
  weakCategories: [{ category: 'Pogrešna inicijalizacija', misses: 2 }],
};

/** GET /api/progress for an unknown user or one with no attempts */
export const progressEmpty = {
  totalScore: 0,
  solved: 0,
  attempted: 0,
  averageDurationSec: 0,
  perChallenge: [],
  weakCategories: [],
};

/** GET /api/attempts (bare array) */
export const attemptsPage = [
  {
    id: 'a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    challengeId: 'find-max',
    status: 'evaluated',
    score: 89,
    breakdown: { lineIdentification: 40, explanation: 24, edgeCase: 20, fix: 10, hintPenalty: -5 },
    feedbackSource: 'ai',
    hintsUsed: 1,
    durationSec: 184,
    createdAt: '2026-11-03T10:15:30.123456+00:00',
  },
];

/** POST /api/users request */
export const userRequest = { displayName: 'dion' };

// docs/API.md shows { "id": "uuid", "displayName": "dion" }; the placeholder is a real UUID here.
/** POST /api/users response (201) */
export const userCreated = { id: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', displayName: 'dion' };

// Error envelopes. VALIDATION_ERROR is the docs/API.md example; the other messages mirror the
// server's texts (server/src/services, server/src/middleware).
export const errorValidation = {
  error: { code: 'VALIDATION_ERROR', message: 'Objašnjenje mora imati najmanje 20 karaktera.' },
};
export const errorValidationGeneric = {
  error: { code: 'VALIDATION_ERROR', message: 'Neispravan unos.' },
};
export const errorChallengeNotFound = {
  error: { code: 'NOT_FOUND', message: 'Izazov ne postoji.' },
};
export const errorRouteNotFound = {
  error: { code: 'NOT_FOUND', message: 'Tražena adresa ne postoji.' },
};
export const errorAlreadyEvaluated = {
  error: { code: 'ALREADY_EVALUATED', message: 'Pokušaj je već ocijenjen.' },
};
export const errorRateLimited = {
  error: { code: 'RATE_LIMITED', message: 'Previše zahtjeva. Sačekaj malo pa pokušaj ponovo.' },
};
export const errorInternal = {
  error: { code: 'INTERNAL_ERROR', message: 'Došlo je do greške. Pokušaj ponovo.' },
};
