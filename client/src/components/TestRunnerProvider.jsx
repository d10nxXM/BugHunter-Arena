import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TestRunnerContext } from '../hooks/useTestRunner.js';
import {
  RUNNER_NOT_READY,
  RUNNER_UNAVAILABLE,
  createRunnerClient,
} from '../workers/runnerClient.js';

// Re-exported for consumers that show or match the runner's messages.
export { RUNNER_NOT_READY, RUNNER_UNAVAILABLE };

function initialState() {
  return typeof Worker === 'undefined'
    ? { ready: false, loadError: RUNNER_UNAVAILABLE }
    : { ready: false, loadError: null };
}

/**
 * Provides { ready, loadError, run } to the whole app. Starts one long-lived test-runner worker
 * when the app opens (Pyodide loads in the background). Contract: src/hooks/useTestRunner.js.
 */
export default function TestRunnerProvider({ children }) {
  const [state, setState] = useState(initialState);
  const clientRef = useRef(null);

  useEffect(() => {
    // StrictMode mounts twice: the cleanup terminates the first worker, the second mount starts
    // a fresh one.
    const client = createRunnerClient({ onState: setState });
    clientRef.current = client;
    return () => {
      client.dispose();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, []);

  const run = useCallback((payload) => {
    const client = clientRef.current;
    if (!client) return Promise.reject(new Error(RUNNER_NOT_READY));
    return client.run(payload);
  }, []);

  const { ready, loadError } = state;
  const value = useMemo(() => ({ ready, loadError, run }), [ready, loadError, run]);

  return <TestRunnerContext.Provider value={value}>{children}</TestRunnerContext.Provider>;
}
