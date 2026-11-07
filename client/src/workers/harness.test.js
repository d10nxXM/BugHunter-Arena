// @vitest-environment node
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  HARNESS,
  HARNESS_CLEANUP,
  HARNESS_ENTRY,
  MAX_ACTUAL_LENGTH,
  MAX_ERROR_LENGTH,
  callHarness,
} from './harness.js';
import { MAX_ERROR_LENGTH as CLIENT_MAX_ERROR_LENGTH } from './runnerClient.js';

describe('callHarness (mocked entry)', () => {
  it('sends tests as JSON without expected values and parses the output', () => {
    const entry = vi.fn(() =>
      JSON.stringify([
        { id: 'a', ok: true, actual: '[1, 2]', error: null },
        { id: 'b', ok: false, actual: null, error: 'ZeroDivisionError: division by zero' },
      ]),
    );
    const results = callHarness(entry, {
      code: 'x',
      functionName: 'f',
      tests: [{ id: 'a', args: [1], expected: 99 }, { id: 'b' }],
    });
    const [code, name, testsJson] = entry.mock.calls[0];
    expect([code, name]).toEqual(['x', 'f']);
    expect(JSON.parse(testsJson)).toEqual([
      { id: 'a', args: [1] },
      { id: 'b', args: [] },
    ]);
    expect(results).toEqual([
      { id: 'a', ok: true, actual: [1, 2], error: null },
      { id: 'b', ok: false, actual: null, error: 'ZeroDivisionError: division by zero' },
    ]);
  });

  it('clips long errors and throws on malformed output', () => {
    const long = JSON.stringify([{ id: 'a', ok: false, actual: null, error: 'E'.repeat(1000) }]);
    const [item] = callHarness(() => long, { code: '', functionName: 'f', tests: [{ id: 'a' }] });
    expect(item.error).toHaveLength(MAX_ERROR_LENGTH);
    expect(() => callHarness(() => '{}', { code: '', functionName: 'f', tests: [] })).toThrow();
    expect(() =>
      callHarness(() => 'not json', { code: '', functionName: 'f', tests: [] }),
    ).toThrow();
  });

  it('shares one MAX_ERROR_LENGTH with the runner client', () => {
    expect(CLIENT_MAX_ERROR_LENGTH).toBe(MAX_ERROR_LENGTH);
  });
});

// The real HARNESS in the real Pyodide (the npm package, run in Node).
describe('HARNESS in Pyodide', () => {
  let entry;

  beforeAll(async () => {
    const require = createRequire(import.meta.url);
    const { loadPyodide } = await import('pyodide');
    const indexURL = path.dirname(require.resolve('pyodide/package.json')) + path.sep;
    const pyodide = await loadPyodide({ indexURL, stdout: () => {}, stderr: () => {} });
    pyodide.runPython(HARNESS);
    entry = pyodide.globals.get(HARNESS_ENTRY);
    pyodide.runPython(HARNESS_CLEANUP);
  }, 120000);

  const run = (code, tests, functionName = 'f') =>
    callHarness(entry, { code, functionName, tests: tests ?? [{ id: 't', args: [] }] });

  it('returns correct values', () => {
    const results = run('def f(a, b):\n    return a + b', [{ id: 't', args: [1, 2] }]);
    expect(results).toEqual([{ id: 't', ok: true, actual: 3, error: null }]);
  });

  it('maps None to null', () => {
    expect(run('def f():\n    return None')[0]).toMatchObject({ ok: true, actual: null });
  });

  it('reports a syntax error for every test', () => {
    const results = run('def f(:\n  pass', [{ id: 'a' }, { id: 'b' }]);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/^SyntaxError/);
    }
  });

  it('names the expected function when it is missing', () => {
    const [r] = run('def other():\n    return 1', undefined, 'find_max');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('find_max');
  });

  it('1/0 fails only that test; the others still run', () => {
    const code = 'def f(x):\n    return 1 / x';
    const results = run(code, [
      { id: 'a', args: [1] },
      { id: 'b', args: [0] },
      { id: 'c', args: [2] },
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[1].error).toMatch(/^ZeroDivisionError/);
    expect(results[2].actual).toBe(0.5);
  });

  it('reports non-JSON results (NaN, set) as errors', () => {
    const code = 'def f(x):\n    return float("nan") if x == 0 else {1, 2}';
    const results = run(code, [
      { id: 'a', args: [0] },
      { id: 'b', args: [1] },
    ]);
    expect(results.every((r) => !r.ok && /JSON/.test(r.error))).toBe(true);
  });

  it('does not leak globals into the next run', () => {
    run('leaked = 5\ndef f():\n    return 1');
    const [r] = run('def f():\n    return leaked');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^NameError/);
  });

  it('reports a result whose encoding is too large as an error', () => {
    const code = `def f():\n    return "x" * ${MAX_ACTUAL_LENGTH + 10}`;
    const [r] = run(code);
    expect(r.ok).toBe(false);
    expect(r.actual).toBeNull();
    expect(r.error).toMatch(/too large/);
    expect(r.error.length).toBeLessThanOrEqual(MAX_ERROR_LENGTH);
  });

  it('keeps a result just under the cap', () => {
    const [r] = run('def f():\n    return "x" * 1000');
    expect(r.ok).toBe(true);
    expect(r.actual).toHaveLength(1000);
  });
});
