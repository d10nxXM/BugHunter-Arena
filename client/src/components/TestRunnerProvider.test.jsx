import { act, render, renderHook } from '@testing-library/react';
import { StrictMode, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestRunner } from '../hooks/useTestRunner.js';
import {
  BAD_REQUEST,
  INIT_TIMEOUT_MS,
  LOAD_FAILED,
  LOAD_TIMEOUT,
  MAX_CRASH_RESTARTS,
  RUNNER_CRASHED,
  RUNNER_NOT_READY,
  RUNNER_UNAVAILABLE,
  RUN_TIMEOUT_MS,
  TOO_MANY_RESTARTS,
} from '../workers/runnerClient.js';
import TestRunnerProvider from './TestRunnerProvider.jsx';

/** One end of a fake MessageChannel. */
class FakePort {
  constructor() {
    this.onmessage = null;
    this.onmessageerror = null;
    this.posted = [];
    this.closed = false;
  }

  postMessage(message) {
    this.posted.push(message);
  }

  close() {
    this.closed = true;
  }
}

class FakeChannel {
  static instances = [];

  constructor() {
    this.port1 = new FakePort();
    this.port2 = new FakePort();
    FakeChannel.instances.push(this);
  }
}

/** Stands in for the module worker. Results come back through the channel's port1. */
class FakeWorker {
  static instances = [];
  static failOnConstruct = false;

  constructor(url, options) {
    if (FakeWorker.failOnConstruct) throw new Error('no worker');
    this.url = String(url);
    this.options = options;
    this.posted = [];
    this.terminated = false;
    this.onerror = null;
    this.onmessageerror = null;
    this.index = FakeWorker.instances.length;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  // The page's end of this worker's private channel.
  get port() {
    return FakeChannel.instances[this.index].port1;
  }

  emit(data) {
    act(() => this.port.onmessage?.({ data }));
  }

  ready() {
    this.emit({ type: 'ready' });
  }

  runs() {
    return this.port.posted.filter((m) => m.type === 'run');
  }

  lastRun() {
    return this.runs().at(-1);
  }

  answer(results) {
    this.emit({ type: 'result', runId: this.lastRun().runId, results });
  }
}

const latest = () => FakeWorker.instances.at(-1);

const TESTS = [
  { id: 't1', args: [[2, 5, 1]], expected: 5 },
  { id: 't2', args: [[-8, -3]], expected: -3 },
  { id: 't3', args: [[]], expected: null },
];
const PAYLOAD = { code: 'def find_max(n): ...', functionName: 'find_max', tests: TESTS };
const ONE = { ...PAYLOAD, tests: [TESTS[0]] };
const OK_T1 = [{ id: 't1', ok: true, actual: 5, error: null }];

const wrapper = ({ children }) => <TestRunnerProvider>{children}</TestRunnerProvider>;

function setup() {
  return renderHook(() => useTestRunner(), { wrapper });
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.failOnConstruct = false;
  FakeChannel.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('MessageChannel', FakeChannel);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TestRunnerProvider', () => {
  it('starts one module worker, hands it a private port and becomes ready', () => {
    const { result } = setup();
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = latest();
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.url).toMatch(/testRunner\.worker\.js/);
    expect(worker.posted).toEqual([{ type: 'init', port: FakeChannel.instances[0].port2 }]);
    expect(result.current).toMatchObject({ ready: false, loadError: null });

    worker.ready();
    expect(result.current).toMatchObject({ ready: true, loadError: null });
  });

  it('run() while not ready rejects with a Montenegrin message and posts nothing', async () => {
    const { result } = setup();
    await expect(result.current.run(PAYLOAD)).rejects.toThrow(RUNNER_NOT_READY);
    expect(latest().port.posted).toHaveLength(0);
  });

  it('runs tests and decides passed on the page with JSON equality', async () => {
    const { result } = setup();
    latest().ready();
    const promise = result.current.run(PAYLOAD);

    const message = latest().lastRun();
    expect(message).toMatchObject({ type: 'run', code: PAYLOAD.code, functionName: 'find_max' });
    expect(typeof message.runId).toBe('string');
    // The worker never receives the expected values.
    expect(message.tests).toEqual(TESTS.map(({ id, args }) => ({ id, args })));

    latest().answer([
      { id: 't1', ok: true, actual: 5, error: null },
      { id: 't2', ok: true, actual: 0, error: null },
      { id: 't3', ok: false, actual: null, error: 'ZeroDivisionError: division by zero' },
    ]);
    await expect(promise).resolves.toEqual({
      timedOut: false,
      results: [
        { id: 't1', passed: true, actual: 5, error: null },
        { id: 't2', passed: false, actual: 0, error: null },
        { id: 't3', passed: false, actual: null, error: 'ZeroDivisionError: division by zero' },
      ],
    });
  });

  it('treats None returned where null is expected as passed', async () => {
    const { result } = setup();
    latest().ready();
    const promise = result.current.run({ ...PAYLOAD, tests: [TESTS[2]] });
    latest().answer([{ id: 't3', ok: true, actual: null, error: null }]);
    await expect(promise).resolves.toMatchObject({ results: [{ id: 't3', passed: true }] });
  });

  it('ignores results with a wrong runId', async () => {
    const { result } = setup();
    latest().ready();
    const promise = result.current.run(ONE);
    latest().emit({ type: 'result', runId: 'guess', results: [{ id: 't1', ok: true, actual: 1 }] });
    latest().emit({ type: 'run-error', runId: 'guess', message: 'x' });
    latest().answer(OK_T1);
    await expect(promise).resolves.toMatchObject({ results: [{ passed: true, actual: 5 }] });
  });

  it('uses a getRandomValues runId when crypto.randomUUID is unavailable (insecure context)', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes) => {
        bytes.fill(171);
        return bytes;
      },
    });
    const { result } = setup();
    latest().ready();
    const promise = result.current.run(ONE);
    expect(latest().lastRun().runId).toBe('ab'.repeat(16));
    latest().answer(OK_T1);
    await expect(promise).resolves.toMatchObject({ timedOut: false });
  });

  it('gives every run a different runId', async () => {
    const { result } = setup();
    latest().ready();
    const first = result.current.run(ONE);
    const id1 = latest().lastRun().runId;
    latest().answer(OK_T1);
    await first;
    const second = result.current.run(ONE);
    expect(latest().lastRun().runId).not.toBe(id1);
    latest().answer(OK_T1);
    await second;
  });

  it('a mismatched answer is treated as a crash: failed results, worker replaced', async () => {
    const { result } = setup();
    const worker = latest();
    worker.ready();
    const promise = result.current.run(PAYLOAD);
    worker.answer([{ id: 'x', ok: true, actual: 5 }]);
    const outcome = await promise;
    expect(outcome.timedOut).toBe(false);
    expect(outcome.results.every((r) => !r.passed && r.actual === null)).toBe(true);
    expect(outcome.results[0].error).toMatch(/^RuntimeError/);
    expect(worker.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('rejects an invalid payload without posting it', async () => {
    const { result } = setup();
    latest().ready();
    await expect(result.current.run({ code: 'x', functionName: '', tests: [] })).rejects.toThrow(
      BAD_REQUEST,
    );
    await expect(result.current.run({ code: 'x', functionName: 'f' })).rejects.toThrow(BAD_REQUEST);
    expect(latest().port.posted).toHaveLength(0);
  });

  it('runs queued calls one at a time, each with its own 3 s', async () => {
    const { result } = setup();
    latest().ready();
    const first = result.current.run(ONE);
    const second = result.current.run({ ...PAYLOAD, tests: [TESTS[1]] });
    expect(latest().runs()).toHaveLength(1);

    act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS - 100));
    latest().answer(OK_T1);
    await expect(first).resolves.toMatchObject({ timedOut: false });
    expect(latest().runs()).toHaveLength(2);

    act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS - 100)); // second run's clock started when sent
    latest().answer([{ id: 't2', ok: true, actual: -3, error: null }]);
    await expect(second).resolves.toMatchObject({ results: [{ passed: true }] });
  });

  it('infinite loop: times out after 3 s, terminates the worker, next run works on a fresh one', async () => {
    const { result } = setup();
    const stuck = latest();
    stuck.ready();
    const promise = result.current.run(PAYLOAD); // the fake worker never answers: while True

    act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS - 1));
    expect(stuck.terminated).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    await expect(promise).resolves.toEqual({
      timedOut: true,
      results: TESTS.map(({ id }) => ({ id, passed: false, actual: null, error: 'timeout' })),
    });
    expect(stuck.terminated).toBe(true);
    expect(stuck.port.closed).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(result.current).toMatchObject({ ready: false, loadError: null });

    latest().ready();
    expect(result.current.ready).toBe(true);
    const next = result.current.run(ONE);
    latest().answer(OK_T1);
    await expect(next).resolves.toMatchObject({ timedOut: false, results: [{ passed: true }] });
  });

  it('ignores messages from the port of a replaced worker (stale port)', async () => {
    const { result } = setup();
    const stuck = latest();
    stuck.ready();
    const staleHandler = stuck.port.onmessage;
    const promise = result.current.run(ONE);
    act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS));
    await promise;

    act(() => staleHandler({ data: { type: 'ready' } }));
    expect(result.current.ready).toBe(false);
    act(() => staleHandler({ data: { type: 'init-error' } }));
    expect(result.current.loadError).toBeNull();
  });

  it('a queued run waits for the fresh worker after a timeout', async () => {
    const { result } = setup();
    latest().ready();
    const first = result.current.run(ONE);
    const second = result.current.run({ ...PAYLOAD, tests: [TESTS[1]] });

    act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS));
    await expect(first).resolves.toMatchObject({ timedOut: true });
    expect(latest().runs()).toHaveLength(0);

    latest().ready();
    expect(latest().runs()).toHaveLength(1);
    latest().answer([{ id: 't2', ok: true, actual: -3, error: null }]);
    await expect(second).resolves.toMatchObject({ results: [{ passed: true }] });
  });

  it('timeouts never count toward the restart limit', async () => {
    const { result } = setup();
    for (let i = 0; i < MAX_CRASH_RESTARTS * 3; i += 1) {
      latest().ready();
      const promise = result.current.run(PAYLOAD);
      act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS));
      await expect(promise).resolves.toMatchObject({ timedOut: true });
    }
    expect(result.current.loadError).toBeNull();
  });

  it('run-error resolves with failed results and replaces the worker', async () => {
    const { result } = setup();
    const worker = latest();
    worker.ready();
    const promise = result.current.run(PAYLOAD);
    worker.emit({ type: 'run-error', runId: worker.lastRun().runId, message: 'RangeError: x' });
    const outcome = await promise;
    expect(outcome.timedOut).toBe(false);
    expect(outcome.results).toHaveLength(3);
    expect(outcome.results[0]).toMatchObject({
      passed: false,
      actual: null,
      error: 'RuntimeError: RangeError: x',
    });
    expect(worker.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(result.current).toMatchObject({ ready: false, loadError: null });
  });

  it('too many crashes in a row: terminal fail() sets loadError, rejects queued runs, no restart', async () => {
    const { result } = setup();
    for (let i = 0; i < MAX_CRASH_RESTARTS; i += 1) {
      latest().ready();
      const promise = result.current.run(ONE);
      latest().emit({ type: 'run-error', runId: latest().lastRun().runId, message: 'boom' });
      await promise;
      expect(result.current.loadError).toBeNull();
    }
    latest().ready();
    const last = result.current.run(ONE);
    const queued = result.current.run(ONE);
    latest().emit({ type: 'run-error', runId: latest().lastRun().runId, message: 'boom' });

    await expect(last).resolves.toMatchObject({ timedOut: false });
    await expect(queued).rejects.toThrow(TOO_MANY_RESTARTS);
    expect(result.current).toMatchObject({ ready: false, loadError: TOO_MANY_RESTARTS });
    expect(FakeWorker.instances).toHaveLength(MAX_CRASH_RESTARTS + 1);
    expect(latest().terminated).toBe(true);
    await expect(result.current.run(ONE)).rejects.toThrow(TOO_MANY_RESTARTS);
  });

  it('a normal run resets the crash count', async () => {
    const { result } = setup();
    for (let i = 0; i < MAX_CRASH_RESTARTS * 2; i += 1) {
      latest().ready();
      const crashed = result.current.run(ONE);
      latest().emit({ type: 'run-error', runId: latest().lastRun().runId, message: 'x' });
      await crashed;
      latest().ready();
      const ok = result.current.run(ONE);
      latest().answer(OK_T1);
      await ok;
    }
    expect(result.current.loadError).toBeNull();
  });

  it('sets loadError when Pyodide does not load within the init timeout', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(INIT_TIMEOUT_MS - 1));
    expect(result.current.loadError).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toMatchObject({ ready: false, loadError: LOAD_TIMEOUT });
    expect(latest().terminated).toBe(true);
  });

  it('the init timeout does not fire once the worker is ready', () => {
    const { result } = setup();
    latest().ready();
    act(() => vi.advanceTimersByTime(INIT_TIMEOUT_MS * 2));
    expect(result.current).toMatchObject({ ready: true, loadError: null });
  });

  it('init-error sets loadError, terminates the worker and rejects later runs', async () => {
    const { result } = setup();
    latest().emit({ type: 'init-error', message: 'TypeError: Failed to fetch' });
    expect(result.current).toMatchObject({ ready: false, loadError: LOAD_FAILED });
    expect(latest().terminated).toBe(true);
    await expect(result.current.run(PAYLOAD)).rejects.toThrow(LOAD_FAILED);
  });

  it.each([
    ['worker.onerror', (w) => w.onerror({ preventDefault() {} })],
    ['worker.onmessageerror', (w) => w.onmessageerror({})],
    ['port.onmessageerror', (w) => w.port.onmessageerror({})],
  ])('%s sets loadError and rejects every pending run', async (_name, trigger) => {
    const { result } = setup();
    const worker = latest();
    worker.ready();
    const running = result.current.run(PAYLOAD);
    const queued = result.current.run(PAYLOAD);

    act(() => trigger(worker));
    await expect(running).rejects.toThrow(RUNNER_CRASHED);
    await expect(queued).rejects.toThrow(RUNNER_CRASHED);
    expect(result.current).toMatchObject({ ready: false, loadError: RUNNER_CRASHED });
    expect(worker.terminated).toBe(true);

    act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS * 2));
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('a Worker that cannot be constructed sets RUNNER_UNAVAILABLE', async () => {
    FakeWorker.failOnConstruct = true;
    const { result } = setup();
    expect(result.current).toMatchObject({ ready: false, loadError: RUNNER_UNAVAILABLE });
    await expect(result.current.run(PAYLOAD)).rejects.toThrow(RUNNER_UNAVAILABLE);
  });

  it('terminates the worker on unmount and settles pending runs', async () => {
    const { result, unmount } = setup();
    const worker = latest();
    worker.ready();
    const promise = result.current.run(PAYLOAD);
    unmount();
    expect(worker.terminated).toBe(true);
    await expect(promise).rejects.toThrow();
  });

  it('StrictMode: the first worker is terminated and the second mount starts a fresh one', () => {
    function Probe() {
      const runner = useTestRunner();
      return <p>{runner.ready ? 'spremno' : 'učitava'}</p>;
    }
    const { getByText } = render(
      <StrictMode>
        <TestRunnerProvider>
          <Probe />
        </TestRunnerProvider>
      </StrictMode>,
    );
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(FakeWorker.instances[1].terminated).toBe(false);

    // The terminated worker's port is detached; the live one drives the state.
    act(() => FakeWorker.instances[0].port.onmessage?.({ data: { type: 'ready' } }));
    expect(getByText('učitava')).toBeInTheDocument();
    FakeWorker.instances[1].ready();
    expect(getByText('spremno')).toBeInTheDocument();
  });

  it('keeps the context value stable across provider re-renders', () => {
    const seen = [];
    function Probe() {
      const value = useTestRunner();
      const ref = useRef(value);
      seen.push(ref.current === value);
      return null;
    }
    const { rerender } = render(
      <TestRunnerProvider>
        <Probe />
      </TestRunnerProvider>,
    );
    rerender(
      <TestRunnerProvider>
        <Probe />
      </TestRunnerProvider>,
    );
    expect(seen.every(Boolean)).toBe(true);
  });

  it('without Worker support it reports RUNNER_UNAVAILABLE and run() rejects', async () => {
    vi.stubGlobal('Worker', undefined);
    const { result } = setup();
    expect(result.current).toMatchObject({ ready: false, loadError: RUNNER_UNAVAILABLE });
    await expect(result.current.run(PAYLOAD)).rejects.toThrow(RUNNER_UNAVAILABLE);
  });
});
