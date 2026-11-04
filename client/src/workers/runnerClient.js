import { compareResults } from '../lib/compareResults.js';

/**
 * Page side of the test runner: owns the long-lived worker, its private MessageChannel, the init
 * timeout, the 3 s run limit, restarts and the run queue. React-free, so TestRunnerProvider stays
 * a thin wrapper. The full contract is the doc comment in src/hooks/useTestRunner.js.
 */
export const RUN_TIMEOUT_MS = 3000;
export const INIT_TIMEOUT_MS = 30000;
// Crash restarts in a row without one run finishing normally. Timeouts are caused by student
// code and never count.
export const MAX_CRASH_RESTARTS = 3;
export const MAX_TEST_ID_LENGTH = 64;
export const MAX_ERROR_LENGTH = 200;

export const RUNNER_UNAVAILABLE = 'Pokretanje testova nije dostupno u ovom pregledaču.';
export const RUNNER_NOT_READY = 'Python okruženje se još učitava. Pokušaj ponovo za par sekundi.';
export const LOAD_FAILED =
  'Python okruženje nije moguće učitati. Osvježi stranicu i pokušaj ponovo.';
export const LOAD_TIMEOUT =
  'Učitavanje Python okruženja traje predugo. Osvježi stranicu i pokušaj ponovo.';
export const RUNNER_CRASHED =
  'Python okruženje je prestalo da radi. Osvježi stranicu i pokušaj ponovo.';
export const TOO_MANY_RESTARTS =
  'Python okruženje se ruši pri svakom pokretanju. Osvježi stranicu.';
export const BAD_REQUEST = 'Testovi nisu pokrenuti: neispravan zahtjev.';
export const RUNNER_STOPPED = 'Pokretanje testova je prekinuto.';

export const TIMEOUT_ERROR = 'timeout';

function defaultCreateWorker() {
  return new Worker(new URL('./testRunner.worker.js', import.meta.url), { type: 'module' });
}

function defaultCreateChannel() {
  return new MessageChannel();
}

/** A crypto-random run id, so code inside the worker cannot predict it. */
function randomRunId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID needs a secure context; getRandomValues does not.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function isValidTestId(id) {
  return typeof id === 'string' && id.length >= 1 && id.length <= MAX_TEST_ID_LENGTH;
}

function isValidPayload(payload) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    typeof payload.code === 'string' &&
    typeof payload.functionName === 'string' &&
    payload.functionName.length > 0 &&
    Array.isArray(payload.tests) &&
    payload.tests.every(
      (test) =>
        test !== null &&
        typeof test === 'object' &&
        isValidTestId(test.id) &&
        (test.args === undefined || Array.isArray(test.args)),
    )
  );
}

function failedResults(tests, error) {
  return tests.map((test) => ({ id: test.id, passed: false, actual: null, error }));
}

function crashError(message) {
  const detail = typeof message === 'string' && message ? message : 'Python okruženje se srušilo';
  return `RuntimeError: ${detail}`.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Builds the public results from the worker's answer. `passed` is decided here, never in the
 * worker. Returns null when the answer does not match the tests that were sent.
 */
function buildResults(tests, workerResults) {
  if (!Array.isArray(workerResults) || workerResults.length !== tests.length) return null;
  const results = [];
  for (let i = 0; i < tests.length; i += 1) {
    const test = tests[i];
    const item = workerResults[i];
    if (!item || item.id !== test.id) return null;
    if (item.ok === true) {
      results.push({
        id: test.id,
        passed: compareResults(item.actual, test.expected),
        actual: item.actual,
        error: null,
      });
    } else {
      results.push({
        id: test.id,
        passed: false,
        actual: null,
        error:
          typeof item.error === 'string' && item.error
            ? item.error.slice(0, MAX_ERROR_LENGTH)
            : 'Error',
      });
    }
  }
  return results;
}

/**
 * createRunnerClient({ onState, createWorker?, createChannel? }) -> { run, dispose }
 * onState({ ready, loadError }) is called on every change.
 */
export function createRunnerClient({
  onState,
  createWorker = defaultCreateWorker,
  createChannel = defaultCreateChannel,
}) {
  let worker = null;
  let port = null; // our end of the private channel; results arrive only here
  let ready = false;
  let loadError = null;
  let disposed = false;
  let initTimer = null;
  let crashRestarts = 0;
  let current = null; // { runId, tests, resolve, reject, timer }
  const queue = [];

  function emit() {
    if (!disposed) onState({ ready, loadError });
  }

  function setState(next) {
    const nextReady = next.ready ?? ready;
    const nextError = next.loadError !== undefined ? next.loadError : loadError;
    if (nextReady === ready && nextError === loadError) return;
    ready = nextReady;
    loadError = nextError;
    emit();
  }

  function stopWorker() {
    clearTimeout(initTimer);
    initTimer = null;
    if (port) {
      port.onmessage = null;
      port.onmessageerror = null;
      port.close();
      port = null;
    }
    if (worker) {
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
  }

  function rejectAll(message) {
    if (current) {
      clearTimeout(current.timer);
      current.reject(new Error(message));
      current = null;
    }
    while (queue.length > 0) queue.shift().reject(new Error(message));
  }

  function fail(message) {
    stopWorker();
    setState({ ready: false, loadError: message });
    rejectAll(message);
  }

  /** Replaces the worker. Queued runs wait for the fresh one. */
  function restart({ crashed }) {
    stopWorker();
    setState({ ready: false });
    if (crashed) {
      crashRestarts += 1;
      if (crashRestarts > MAX_CRASH_RESTARTS) {
        fail(TOO_MANY_RESTARTS);
        return;
      }
    }
    start();
  }

  /** The current run crashed the runtime: resolve it like a timeout, then replace the worker. */
  function finishWithCrash(job, message) {
    clearTimeout(job.timer);
    current = null;
    job.resolve({ results: failedResults(job.tests, crashError(message)), timedOut: false });
    restart({ crashed: true });
  }

  function handleMessage(source, event) {
    if (source !== port) return; // a stale message from a replaced worker
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'ready') {
      clearTimeout(initTimer);
      initTimer = null;
      setState({ ready: true });
      pump();
      return;
    }
    if (data.type === 'init-error') {
      fail(LOAD_FAILED);
      return;
    }
    if (!current || data.runId !== current.runId) return;

    const job = current;
    if (data.type === 'result') {
      const results = buildResults(job.tests, data.results);
      if (results === null) {
        finishWithCrash(job, 'neispravan odgovor Python okruženja');
        return;
      }
      clearTimeout(job.timer);
      current = null;
      crashRestarts = 0;
      job.resolve({ results, timedOut: false });
      pump();
      return;
    }
    if (data.type === 'run-error') {
      finishWithCrash(job, data.message);
    }
  }

  function start() {
    if (disposed) return;
    let createdWorker;
    let channel;
    try {
      channel = createChannel();
      createdWorker = createWorker();
    } catch {
      fail(RUNNER_UNAVAILABLE);
      return;
    }
    worker = createdWorker;
    port = channel.port1;
    const ownPort = channel.port1;
    ownPort.onmessage = (event) => handleMessage(ownPort, event);
    ownPort.onmessageerror = () => {
      if (ownPort === port) fail(RUNNER_CRASHED);
    };
    createdWorker.onerror = (event) => {
      if (createdWorker !== worker) return;
      event?.preventDefault?.();
      fail(RUNNER_CRASHED);
    };
    createdWorker.onmessageerror = () => {
      if (createdWorker === worker) fail(RUNNER_CRASHED);
    };
    try {
      // Hand the worker its private port before any student code can run there.
      createdWorker.postMessage({ type: 'init', port: channel.port2 }, [channel.port2]);
    } catch {
      fail(RUNNER_UNAVAILABLE);
      return;
    }
    initTimer = setTimeout(() => {
      if (createdWorker !== worker || ready) return;
      fail(LOAD_TIMEOUT);
    }, INIT_TIMEOUT_MS);
  }

  function onRunTimeout(job) {
    if (current !== job) return;
    current = null;
    job.resolve({ results: failedResults(job.tests, TIMEOUT_ERROR), timedOut: true });
    // Terminate the stuck worker and load a fresh Pyodide. Not counted: student code did this.
    restart({ crashed: false });
  }

  function pump() {
    if (current || !ready || !port || queue.length === 0) return;
    const job = queue.shift();
    job.runId = randomRunId();
    current = job;
    try {
      port.postMessage({
        type: 'run',
        runId: job.runId,
        code: job.code,
        functionName: job.functionName,
        tests: job.tests.map((test) => ({ id: test.id, args: test.args ?? [] })),
      });
    } catch {
      current = null;
      job.reject(new Error(BAD_REQUEST));
      pump();
      return;
    }
    job.timer = setTimeout(() => onRunTimeout(job), RUN_TIMEOUT_MS);
  }

  function run(payload) {
    if (disposed) return Promise.reject(new Error(RUNNER_STOPPED));
    if (loadError) return Promise.reject(new Error(loadError));
    if (!ready) return Promise.reject(new Error(RUNNER_NOT_READY));
    if (!isValidPayload(payload)) return Promise.reject(new Error(BAD_REQUEST));
    return new Promise((resolve, reject) => {
      queue.push({
        code: payload.code,
        functionName: payload.functionName,
        tests: payload.tests.map((test) => ({
          id: test.id,
          args: test.args,
          expected: test.expected,
        })),
        resolve,
        reject,
        timer: null,
      });
      pump();
    });
  }

  function dispose() {
    if (disposed) return;
    stopWorker();
    rejectAll(RUNNER_STOPPED);
    disposed = true;
  }

  emit(); // reset the consumer's state, e.g. after a StrictMode remount
  start();
  return { run, dispose };
}
