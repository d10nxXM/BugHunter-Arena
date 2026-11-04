import { TestRunnerContext } from '../hooks/useTestRunner.js';

// M1 stub: never ready, executes nothing, and run() always rejects, so its output can never be
// mistaken for real failed tests. Worker D replaces it with the real provider following the
// contract in src/hooks/useTestRunner.js (long-lived worker, 3 s timeout, fresh worker after one).
export const RUNNER_UNAVAILABLE = 'Pokretanje testova još nije dostupno.';

function run() {
  return Promise.reject(new Error(RUNNER_UNAVAILABLE));
}

const value = { ready: false, loadError: RUNNER_UNAVAILABLE, run };

export default function TestRunnerProvider({ children }) {
  return <TestRunnerContext.Provider value={value}>{children}</TestRunnerContext.Provider>;
}
