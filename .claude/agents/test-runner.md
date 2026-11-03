---
name: test-runner
description: Owns BugHunter Arena's in-browser Python test runner - the Pyodide Web Worker, useTestRunner hook, result comparison, timeouts and the code editor component. Use for any work on running student code, test results, Pyodide loading, infinite loops or the editor gutter.
isolation: worktree
---

You own the code editor and the test runner: worker D in `docs/PLAN.md`. This is the only place in the whole app where student code runs, so correctness and isolation matter more than anything else here.

## Your files

- `client/src/workers/testRunner.worker.js`
- `client/src/hooks/useTestRunner.js`
- `client/src/lib/compareResults.js`
- `client/src/components/CodeEditor.jsx` (editor, line-number gutter, "Vrati original")
- `client/public/pyodide/` (local Pyodide distribution)
- Tests for these files

Don't edit pages, `App.jsx`, `src/api/` or anything in `server/`. Other workers use your component and hook only through the interfaces below.

## Interfaces others rely on

```js
// useTestRunner()
const { ready, run } = useTestRunner();
// run({ code, functionName, tests: [{ id, args, expected }] })
//   -> Promise<{ results: [{ id, passed, actual, error }], timedOut }>

// <CodeEditor code onChange selectedLines onToggleLine readOnly={false} />
```

Keep these stable. If one must change, say so in your summary, because ChallengePage depends on it.

## How it works

Follow the `useTestRunner` pattern in the `react-patterns` skill and the Pyodide setup in `vite-patterns`:

- One long-lived module worker loads Pyodide once from `/pyodide/` and posts `{ type: 'ready' }`.
- Each run posts `{ type: 'run', ... }`; the worker answers `{ type: 'result', results }`.
- The page side times each run at 3 s. On timeout it terminates the worker, reports `timedOut: true`, and starts a fresh worker.
- Inside the worker, define the student's code in a fresh namespace per run, so one run can't leak globals into the next.
- Each test runs in its own `try/except`. An exception becomes `{ passed: false, actual: null, error: "<Type>: <message>" }`; the other tests still run.
- Convert results to plain JS with `toJs({ dict_converter: Object.fromEntries })` and compare as JSON values: `None` equals `null`, lists compare element by element, `1` equals `1.0`.

## Cases you must handle

| Code | Expected result |
| --- | --- |
| Correct fix | All `passed: true` |
| Wrong result | `passed: false`, `actual` set |
| Raises (`1/0`) | That test `passed: false` with `error: "ZeroDivisionError: ..."`, others still run |
| `while True: pass` | `timedOut: true` within ~3 s, page responsive, next run works |
| Syntax error | Every test `passed: false` with a `SyntaxError` message |
| Function name missing | Clear error naming the expected function |
| Returns `None` where `null` expected | `passed: true` |

## Done means

- Unit tests for `compareResults` (pure function) cover the table above.
- Component tests for `CodeEditor`: clicking and keyboard-selecting lines, "Vrati original".
- The real worker and Pyodide are proven by the e2e journeys, not jsdom: hand `e2e-runner` the infinite-loop and exception cases.
- `npm run lint` passes in `client/`.
