/** Route paths. Build links with these instead of writing URLs by hand. */
export const paths = {
  home: '/',
  challenge: (id) => `/challenges/${encodeURIComponent(id)}`,
  result: (id) => `/challenges/${encodeURIComponent(id)}/result`,
  progress: '/progress',
};

/**
 * Router state passed from ChallengePage to ResultView
 * (`navigate(paths.result(id), { state })`). A direct visit to the result URL has no state.
 *
 * @typedef {object} ResultState
 * @property {string} attemptId - `attemptId` from the POST /api/attempts response.
 * @property {string} challengeId
 * @property {Array<{ id: string, args: unknown[], expected: unknown, visible: boolean }>} tests
 *   - `tests` from the POST /api/attempts response (visible and hidden).
 * @property {Array<{ id: string, passed: boolean, actual: unknown, error?: string | null }>} testResults
 *   - Browser results of running every test on the fixed code.
 * @property {{
 *   score: number,
 *   breakdown: { lineIdentification: number, explanation: number, edgeCase: number, fix: number, hintPenalty: number },
 *   testsPassed: number,
 *   testsTotal: number,
 *   feedbackSource: 'ai' | 'fallback' | 'demo',
 *   feedback: {
 *     is_correct: boolean,
 *     explanation_quality: number,
 *     detected_misconception: string | null,
 *     needs_clarification: boolean,
 *     hint: string | null,
 *     feedback: string,
 *     practice_tip: string | null,
 *   },
 * }} evaluation - The POST /api/attempts/:id/evaluation response.
 */
