import { useCallback, useLayoutEffect, useRef } from 'react';

/** Safety bound on one run() call, on top of the runner's own 3 s limit per run. */
export const RUN_TIMEOUT_MS = 10000;
/** Longest wait for the runner to become ready again (a fresh worker loads Pyodide). */
export const RUNNER_WAIT_MS = 35000;

/** After a rejected run, time for the runner's not-ready state to reach this component. */
export const SETTLE_MS = 50;

export const RUN_TIMEOUT_MESSAGE = 'Pokretač testova nije odgovorio.';
export const RUNNER_WAIT_MESSAGE = 'Pokretač testova nije spreman.';

function abortReason(signal) {
  return signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

class RunTimeoutError extends Error {
  constructor() {
    super(RUN_TIMEOUT_MESSAGE);
    this.name = 'RunTimeoutError';
  }
}

/**
 * Wraps the runner from useTestRunner() so no caller can hang on it:
 *
 *   safeRun(args, { signal }) -> Promise<{ results, timedOut }>
 *
 * - Every run() is bounded by RUN_TIMEOUT_MS and rejects with RUN_TIMEOUT_MESSAGE after it.
 * - After a timeout or a crash the runner restarts its worker, and a run() during the restart
 *   rejects. The caller's closure may still see ready === true from an older render, so on a
 *   rejection this waits SETTLE_MS, then reads the RENDERED state (updated in a layout effect):
 *   if the runner is not ready and has no loadError, it waits for ready (at most
 *   RUNNER_WAIT_MS, rejecting on loadError or abort) and retries that run once. Any other
 *   rejection is passed on: "tests did not run".
 */
export function useRunnerGate({ ready, loadError, run }) {
  // The rendered runner state; callers' closures may be one render behind.
  const stateRef = useRef({ ready, loadError });
  const waitersRef = useRef(new Set());

  useLayoutEffect(() => {
    stateRef.current = { ready, loadError };
    for (const notify of [...waitersRef.current]) notify();
  }, [ready, loadError]);

  const waitForReady = useCallback(
    (signal) =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortReason(signal));
          return;
        }
        let settled = false;
        const finish = (settle) => {
          if (settled) return;
          settled = true;
          waitersRef.current.delete(check);
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          settle();
        };
        const onAbort = () => finish(() => reject(abortReason(signal)));
        function check() {
          const state = stateRef.current;
          if (state.ready) finish(resolve);
          else if (state.loadError) finish(() => reject(new Error(state.loadError)));
        }
        const timer = setTimeout(
          () => finish(() => reject(new Error(RUNNER_WAIT_MESSAGE))),
          RUNNER_WAIT_MS,
        );
        waitersRef.current.add(check);
        signal?.addEventListener('abort', onAbort, { once: true });
        check();
      }),
    [],
  );

  const runBounded = useCallback(
    (args, signal) =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortReason(signal));
          return;
        }
        let settled = false;
        const finish = (settle) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          settle();
        };
        const onAbort = () => finish(() => reject(abortReason(signal)));
        const timer = setTimeout(() => finish(() => reject(new RunTimeoutError())), RUN_TIMEOUT_MS);
        signal?.addEventListener('abort', onAbort, { once: true });
        Promise.resolve()
          .then(() => run(args))
          .then(
            (value) => finish(() => resolve(value)),
            (error) => finish(() => reject(error)),
          );
      }),
    [run],
  );

  return useCallback(
    async (args, { signal } = {}) => {
      try {
        return await runBounded(args, signal);
      } catch (error) {
        if (signal?.aborted || error instanceof RunTimeoutError) throw error;
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        if (signal?.aborted) throw abortReason(signal);
        const state = stateRef.current;
        if (state.ready || state.loadError) throw error;
        await waitForReady(signal);
        return runBounded(args, signal);
      }
    },
    [runBounded, waitForReady],
  );
}
