import { createContext, useContext } from 'react';

/**
 * Test runner shared by the whole app (one long-lived worker), provided by TestRunnerProvider.
 * Shape: { ready: boolean, loadError: string | null, run }.
 * run({ code, functionName, tests: [{ id, args, expected }] })
 *   -> Promise<{ results: [{ id, passed, actual, error }], timedOut: boolean }>
 *
 * M1 stub. Worker D owns this file and keeps this interface.
 */
export const TestRunnerContext = createContext(null);

export function useTestRunner() {
  return useContext(TestRunnerContext);
}
