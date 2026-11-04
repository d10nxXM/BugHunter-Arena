import { TestRunnerContext } from '../hooks/useTestRunner.js';

// M1 stub: executes nothing and reports every test as not run.
// Worker D replaces it with one long-lived module worker (src/workers/testRunner.worker.js)
// started at app load, a 3 s timeout per run, and a fresh worker after a timeout.
const STUB_ERROR = 'Pokretanje testova još nije dostupno.';

function run({ tests }) {
  return Promise.resolve({
    results: tests.map((test) => ({ id: test.id, passed: false, actual: null, error: STUB_ERROR })),
    timedOut: false,
  });
}

const value = { ready: true, loadError: null, run };

export default function TestRunnerProvider({ children }) {
  return <TestRunnerContext.Provider value={value}>{children}</TestRunnerContext.Provider>;
}
