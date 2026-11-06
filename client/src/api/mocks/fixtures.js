// Fixtures shaped like the JSON examples in docs/API.md, with English content (the site is English;
// docs/API.md and the server's challenge data still show Montenegrin examples until they are
// translated). mocks.test.js checks each fixture has the same shape as its doc example, so change a
// shape in the doc first (api-contract skill) and then mirror it here.
//
// Integrity: only attemptCreated (the POST /api/attempts response) and the evaluation fixtures may
// hold the reference solution or hidden tests (t3, t4). GET and hint fixtures never do.

/** GET /api/health */
export const health = { status: 'ok', ai: 'available', demoMode: false };

/** GET /healthz (liveness for the hosting platform; the client never calls it) */
export const healthz = { status: 'ok' };

/** GET /api/challenges */
export const challengeList = [
  {
    id: 'find-max',
    title: 'Largest number in a list',
    language: 'python',
    difficulty: 'easy',
    bugCategory: 'Wrong initialization',
  },
];

/** GET /api/challenges/find-max */
export const findMaxPublic = {
  id: 'find-max',
  title: 'Largest number in a list',
  description:
    'The function find_max returns the largest number in a list. For an empty list it returns None.',
  language: 'python',
  difficulty: 'easy',
  bugCategory: 'Wrong initialization',
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
  hint: 'Does the function work for every list of numbers, or only for the usual ones?',
  source: 'written',
};

// Levels 2 and 3 are not in docs/API.md. English versions of the hints table in docs/SPEC.md
// (hints_json in server/data/challenges/find-max.json); source 'written'.
export const hintLevel2 = {
  level: 2,
  hint: 'What does the function return if every number in the list is negative?',
  source: 'written',
};

export const hintLevel3 = {
  level: 3,
  hint: 'Look at the starting value of the variable max_value.',
  source: 'written',
};

/** POST /api/attempts request */
export const attemptRequest = {
  challengeId: 'find-max',
  userId: null,
  selectedLines: [2],
  explanation:
    'max_value starts at 0. If all the numbers are negative, none is greater than 0, so the function returns 0, which is not in the list.',
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
    detected_misconception: 'Assuming the list always contains at least one positive number.',
    needs_clarification: false,
    hint: null,
    feedback:
      'You correctly spotted that the starting value 0 breaks when every number is negative. Good that you confirmed it with the test [-8, -3, -10]. For full marks, also cover the empty list.',
    practice_tip:
      'When you look for the largest or smallest element, start from the first element of the list, not from an arbitrary constant.',
  },
};

// Not an API.md example. Follows docs/SCORING.md "Fallback without the AI" for an explanation
// that matches one keyword group: quality 3 -> explanation round(3 * 3) = 9, is_correct false;
// total 40 + 9 + 20 + 10 - 5 = 74. feedback is an English version of find-max's fallback_feedback.
// mocks.test.js checks this arithmetic.
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
      'The bug is the starting value max_value = 0. If all the numbers are negative, none is greater than 0, so the function returns 0, which is not in the list. Start the maximum from the first element and handle the empty list separately.',
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
  weakCategories: [{ category: 'Wrong initialization', misses: 2 }],
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

// Error envelopes. VALIDATION_ERROR has the shape of the docs/API.md example; the codes mirror the
// server (server/src/services, server/src/middleware), the messages are English.
export const errorValidation = {
  error: {
    code: 'VALIDATION_ERROR',
    message: 'The explanation must be at least 20 characters long.',
  },
};
export const errorValidationGeneric = {
  error: { code: 'VALIDATION_ERROR', message: 'Invalid input.' },
};
export const errorChallengeNotFound = {
  error: { code: 'NOT_FOUND', message: 'Challenge not found.' },
};
export const errorRouteNotFound = {
  error: { code: 'NOT_FOUND', message: 'The requested address does not exist.' },
};
export const errorAlreadyEvaluated = {
  error: { code: 'ALREADY_EVALUATED', message: 'This attempt has already been evaluated.' },
};
export const errorRateLimited = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait a moment and try again.' },
};
export const errorInternal = {
  error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
};

// Accounts: the auth endpoints, GET /api/me and GET /api/profiles/:handle, shaped like the
// contract in docs/API.md (Phase 2 auth). The mock tokens are not real JWTs.

/** POST /api/auth/signup request */
export const signupRequest = {
  handle: 'null_pointer',
  email: 'hunter@example.com',
  password: 'correct-horse-battery',
};

/** POST /api/auth/login request */
export const loginRequest = { email: 'hunter@example.com', password: 'correct-horse-battery' };

/** The account user in the auth responses; also GET /api/me. */
export const accountUser = {
  id: '0b8f4f8e-2c1a-4d3b-9e5f-7a6b5c4d3e2f',
  handle: 'null_pointer',
  displayName: 'null_pointer',
  memberSince: '2026-03-14T09:30:00.000Z',
};

/** `session` of the auth responses; expiresAt is epoch seconds. */
export const authSession = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresAt: 1793961600,
};

/** POST /api/auth/signup (201) and POST /api/auth/login (200) response */
export const authResponse = { session: authSession, user: accountUser };

/** POST /api/auth/refresh request */
export const refreshRequest = { refreshToken: 'mock-refresh-token' };

/** POST /api/auth/refresh response */
export const refreshResponse = {
  session: {
    accessToken: 'mock-access-token-2',
    refreshToken: 'mock-refresh-token-2',
    expiresAt: 1793965200,
  },
};

/** GET /api/me response */
export const me = accountUser;

/** GET /api/profiles/:handle response */
export const profile = {
  handle: 'null_pointer',
  displayName: 'null_pointer',
  memberSince: '2026-03-14T09:30:00.000Z',
  rank: { name: 'Hunter', xp: 169, nextName: 'Exterminator', xpToNext: 31 },
  totalXp: 169,
  solved: 2,
  attempted: 3,
  challengesAvailable: 6,
  solvedByLanguage: [{ language: 'python', solved: 2 }],
  recentSolves: [
    {
      challengeId: 'find-max',
      title: 'Largest number in a list',
      language: 'python',
      difficulty: 'easy',
      bestScore: 89,
      solvedAt: '2026-11-03T10:15:30.123Z',
    },
    {
      challengeId: 'count-vowels',
      title: 'Count the vowels',
      language: 'python',
      difficulty: 'medium',
      bestScore: 80,
      solvedAt: '2026-11-01T18:02:11.000Z',
    },
  ],
};

/** GET /api/profiles/:handle for an account with no attempts */
export const profileEmpty = {
  handle: 'fresh_hunter',
  displayName: 'fresh_hunter',
  memberSince: '2026-11-06T12:00:00.000Z',
  rank: { name: 'Larva', xp: 0, nextName: 'Hunter', xpToNext: 100 },
  totalXp: 0,
  solved: 0,
  attempted: 0,
  challengesAvailable: 6,
  solvedByLanguage: [],
  recentSolves: [],
};

export const errorUnauthorized = {
  error: { code: 'UNAUTHORIZED', message: 'Log in to continue.' },
};
export const errorInvalidCredentials = {
  error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
};
export const errorHandleTaken = {
  error: { code: 'HANDLE_TAKEN', message: 'This handle is already taken.' },
};
export const errorEmailTaken = {
  error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' },
};
export const errorProfileNotFound = {
  error: { code: 'NOT_FOUND', message: 'Hunter not found.' },
};
export const errorAuthUnavailable = {
  error: { code: 'AUTH_UNAVAILABLE', message: 'Accounts are not available right now.' },
};
