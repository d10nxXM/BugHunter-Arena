import { act, render, renderHook } from '@testing-library/react';
import { StrictMode, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestRunner } from '../hooks/useTestRunner.js';
import {
  BAD_REQUEST,
  INIT_TIMEOUT_MS,
  LOAD_FAILED,
  LOAD_TIMEOUT,
  MAX_CONSECUTIVE_RESTARTS,
  RUNNER_CRASHED,
  RUNNER_NOT_READY,
  RUNNER_UNAVAILABLE,
  RUN_FAILED,
  RUN_TIMEOUT_MS,
  TOO_MANY_RESTARTS,
} from '../workers/runnerClient.js';
import TestRunnerProvider from './TestRunnerProvider.jsx';

/** Stands in for the module worker; tests drive it with the worker's protocol messages. */
class FakeWorker {
  static instances = [];

  constructor(url, options) {
    this.url = String(url);
    this.options = options;
    this.posted = [];
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  // Helpers
  emit(data) {
    act(() => this.onmessage?.({ data }));
  }

  ready() {
    this.emit({ type: 'ready' });
  }

  lastRun() {
    return this.posted.filter((m) => m.type === 'run').at(-1);
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

const wrapper = ({ children }) => <TestRunnerProvider>{children}</TestRunnerProvider>;

function setup() {
  return renderHook(() => useTestRunner(), { wrapper });
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TestRunnerProvider', () => {
  it('starts one module worker on mount and becomes ready on its ready message', () => {
    const { result } = setup();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(latest().options).toEqual({ type: 'module' });
    expect(latest().url).toMatch(/testRunner\.worker\.js/);
    expect(result.current).toMatchObject({ ready: false, loadError: null });

    latest().ready();
    expect(result.current).toMatchObject({ ready: true, loadError: null });
  });

  it('run() while not ready rejects with a Montenegrin message and posts nothing', async () => {
    const { result } = setup();
    await expect(result.current.run(PAYLOAD)).rejects.toThrow(RUNNER_NOT_READY);
    expect(latest().posted).toHaveLength(0);
  });

  it('runs tests and decides passed on the page with JSON equality', async () => {
    const { result } = setup();
    latest().ready();
    const promise = result.current.run(PAYLOAD);

    const message = latest().lastRun();
    expect(message).toMatchObject({ type: 'run', code: PAYLOAD.code, functionName: 'find_max' });
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

  it('ignores results with a stale runId', async () => {
    const { result } = setup();
    latest().ready();
    const promise = result.current.run({ ...PAYLOAD, tests: [TESTS[0]] });
    latest().emit({ type: 'result', runId: -1, results: [{ id: 't1', ok: true, actual: 1 }] });
    latest().answer([{ id: 't1', ok: true, actual: 5, error: null }]);
    await expect(promise).resolves.toMatchObject({ results: [{ passed: true, actual: 5 }] });
  });

  it('rejects when the worker answers with results that do not match the tests', async () => {
    const { result } = setup();
    latest().ready();
    const promise = result.current.run(PAYLOAD);
    latest().answer([{ id: 'x', ok: true, actual: 5 }]);
    await expect(promise).rejects.toThrow(RUN_FAILED);
  });

  it('rejects an invalid payload without posting it', async () => {
    const { result } = setup();
    latest().ready();
    await expect(result.current.run({ code: 'x', functionName: '', tests: [] })).rejects.toThrow(
      BAD_REQUEST,
    );
    await expect(result.current.run({ code: 'x', functionName: 'f' })).rejects.toThrow(BAD_REQUEST);
    expect(latest().posted).toHaveLength(0);
  });

  it('runs queued calls one at a time, each with its own 3 s', async () => {
    const { result } = setup();
    latest().ready();
    const first = result.current.run({ ...PAYLOAD, tests: [TESTS[0]] });
    const second = result.current.run({ ...PAYLOAD, tests: [TESTS[1]] });
    expect(latest().posted).toHaveLength(1);

    vi.advanceTimersByTime(RUN_TIMEOUT_MS - 100);
    latest().answer([{ id: 't1', ok: true, actual: 5, error: null }]);
    await expect(first).resolves.toMatchObject({ timedOut: false });
    expect(latest().posted).toHaveLength(2);

    vi.advanceTimersByTime(RUN_TIMEOUT_MS - 100); // the second run's clock started when sent
    latest().answer([{ id: 't2', ok: true, actual: -3, error: null }]);
    await expect(second).resolves.toMatchObject({ results: [{ passed: true }] });
  });

  it('times out after 3 s: timeout results, the worker is replaced, the next run works', async () => {
    const { result } = setup();
    const stuck = latest();
    stuck.ready();
    const promise = result.current.run(PAYLOAD);

    act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS));
    await expect(promise).resolves.toEqual({
      timedOut: true,
      results: TESTS.map(({ id }) => ({ id, passed: false, actual: null, error: 'timeout' })),
    });
    expect(stuck.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(result.current).toMatchObject({ ready: false, loadError: null });

    // A late answer from the terminated worker is ignored.
    stuck.onmessage?.({ data: { type: 'ready' } });
    expect(result.current.ready).toBe(false);

    latest().ready();
    expect(result.current.ready).toBe(true);
    const next = result.current.run({ ...PAYLOAD, tests: [TESTS[0]] });
    latest().answer([{ id: 't1', ok: true, actual: 5, error: null }]);
    await expect(next).resolves.toMatchObject({ timedOut: false, results: [{ passed: true }] });
  });

  it('a queued run waits for the fresh worker after a timeout', async () => {
    const { result } = setup();
    latest().ready();
    const first = result.current.run({ ...PAYLOAD, tests: [TESTS[0]] });
    const second = result.current.run({ ...PAYLOAD, tests: [TESTS[1]] });

    act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS));
    await expect(first).resolves.toMatchObject({ timedOut: true });
    expect(latest().posted).toHaveLength(0);

    latest().ready();
    expect(latest().posted).toHaveLength(1);
    latest().answer([{ id: 't2', ok: true, actual: -3, error: null }]);
    await expect(second).resolves.toMatchObject({ results: [{ passed: true }] });
  });

  it('stops restarting after too many timeouts in a row and sets loadError', async () => {
    const { result } = setup();
    for (let i = 0; i < MAX_CONSECUTIVE_RESTARTS; i += 1) {
      latest().ready();
      const promise = result.current.run(PAYLOAD);
      act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS));
      await expect(promise).resolves.toMatchObject({ timedOut: true });
      expect(result.current.loadError).toBeNull();
    }
    latest().ready();
    const last = result.current.run(PAYLOAD);
    act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS));
    await expect(last).resolves.toMatchObject({ timedOut: true });

    expect(result.current).toMatchObject({ ready: false, loadError: TOO_MANY_RESTARTS });
    expect(FakeWorker.instances).toHaveLength(MAX_CONSECUTIVE_RESTARTS + 1);
    expect(latest().terminated).toBe(true);
    await expect(result.current.run(PAYLOAD)).rejects.toThrow(TOO_MANY_RESTARTS);
  });

  it('a normal run resets the restart count', async () => {
    const { result } = setup();
    for (let i = 0; i < MAX_CONSECUTIVE_RESTARTS * 2; i += 1) {
      latest().ready();
      const timedOut = result.current.run(PAYLOAD);
      act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS));
      await timedOut;
      latest().ready();
      const ok = result.current.run({ ...PAYLOAD, tests: [TESTS[0]] });
      latest().answer([{ id: 't1', ok: true, actual: 5, error: null }]);
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

  it('sets loadError when the worker reports that Pyodide failed to load', () => {
    const { result } = setup();
    latest().emit({ type: 'init-error', message: 'TypeError: Failed to fetch' });
    expect(result.current).toMatchObject({ ready: false, loadError: LOAD_FAILED });
  });

  it.each([
    ['onerror', (w) => w.onerror({ preventDefault() {} })],
    ['onmessageerror', (w) => w.onmessageerror({})],
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

    // No restart, and the old run's timer does not fire anything later.
    act(() => vi.advanceTimersByTime(RUN_TIMEOUT_MS * 2));
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('a broken run rejects (tests did not run) and replaces the worker', async () => {
    const { result } = setup();
    const worker = latest();
    worker.ready();
    const promise = result.current.run(PAYLOAD);
    worker.emit({ type: 'run-error', runId: worker.lastRun().runId, message: 'RangeError' });
    await expect(promise).rejects.toThrow(RUN_FAILED);
    expect(worker.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(result.current).toMatchObject({ ready: false, loadError: null });
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

    // The terminated worker's messages are ignored; the live one drives the state.
    act(() => FakeWorker.instances[0].onmessage?.({ data: { type: 'ready' } }));
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
