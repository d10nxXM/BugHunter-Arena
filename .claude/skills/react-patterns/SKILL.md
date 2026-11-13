---
name: react-patterns
description: React patterns for BugHunter Arena's client (plain JavaScript, Vite, Tailwind) - hooks discipline, where state lives, data fetching through src/api, the test-runner worker hook, forms, and composition. Use when writing or reviewing components and hooks in client/.
---

# React patterns

## Core rules

1. **Render is pure.** Same props and state, same output. No fetches, timers or worker messages during render.
2. **Effects are for syncing with the outside** (worker, timer, network). Not for computing values from props or state; compute those during render.
3. **Composition over configuration.** Pass `children` and small components instead of growing a component with boolean props.

## Hooks discipline

- Call hooks at the top level, never in conditions, loops or after an early return.
- List every reactive value in the dependency array. Don't silence `exhaustive-deps`; restructure instead.
- Every effect that starts something cleans it up (terminate worker, clear interval, abort fetch).
- Use the functional updater when the next state depends on the previous: `setHints((n) => n + 1)`.
- Custom hooks start with `use` and return a small object.

## Where state lives

| Data | Where |
| --- | --- |
| Challenge, attempt result, progress (server data) | Page component, loaded via `src/api/` |
| Selected lines, explanation, edge case, fixed code | `ChallengePage` state, passed down |
| Hints used, timer | `ChallengePage` state (sent with the attempt) |
| Display name / user id | Context (`UserContext`), low-frequency |
| Derived values (is form valid, penalty so far) | Computed during render, not stored |

Don't copy props into state. Don't store the same data twice.

## Data fetching

All requests go through `src/api/`. Components never call `fetch` directly.

```jsx
// src/api/client.js
const BASE = import.meta.env.VITE_API_URL;

export async function api(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error?.message ?? 'Something went wrong talking to the server.');
    error.code = data?.error?.code ?? 'NETWORK_ERROR';
    throw error;
  }
  return data;
}
```

```jsx
// loading a challenge
function useChallenge(id) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: null });
    api(`/api/challenges/${id}`, { signal: controller.signal })
      .then((data) => setState({ status: 'ready', data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'error', data: null, error });
      });
    return () => controller.abort();
  }, [id]);

  return state;
}
```

Clear old data on error so a stale challenge is never shown with a new error.

## The test-runner hook

One long-lived worker holds Pyodide, so tests don't pay the multi-second load on every run. The 3 s timeout covers only the run. If a run times out (an infinite loop), that worker is killed and a fresh one starts loading in the background.

```jsx
// src/hooks/useTestRunner.js
const WORKER_URL = new URL('../workers/testRunner.worker.js', import.meta.url);

export function useTestRunner() {
  const workerRef = useRef(null);
  const [ready, setReady] = useState(false);

  const start = useCallback(() => {
    workerRef.current?.terminate();
    setReady(false);
    const worker = new Worker(WORKER_URL, { type: 'module' });
    worker.addEventListener('message', (e) => {
      if (e.data.type === 'ready') setReady(true);
    });
    workerRef.current = worker;
  }, []);

  useEffect(() => {
    start();
    return () => workerRef.current?.terminate();
  }, [start]);

  const run = useCallback((payload) => new Promise((resolve) => {
    const worker = workerRef.current;
    const timer = setTimeout(() => {
      worker.removeEventListener('message', onMessage);
      start(); // kill the stuck run, load a fresh Pyodide in the background
      resolve({ timedOut: true, results: [] });
    }, 3000);
    function onMessage(e) {
      if (e.data.type !== 'result') return;
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      resolve(e.data);
    }
    worker.addEventListener('message', onMessage);
    worker.postMessage({ type: 'run', ...payload });
  }), [start]);

  return { ready, run };
}
```

Disable "Run visible tests" and "Submit answer" until `ready` is true, with a short "Loading Python…" message. The worker posts `{ type: 'ready' }` after Pyodide loads and `{ type: 'result', results }` after each run, catching Python exceptions per test so one crash doesn't hide the other results.

## Forms

- Use a real `<form onSubmit>` with `preventDefault`, labelled inputs, and a disabled submit button while sending.
- Validate on the client for fast feedback (explanation 20-1000 chars), but the server's Zod validation is the authority.
- Show server validation messages next to the field they belong to.

## Composition

- Components under ~200 lines. Extract a subcomponent or hook when it grows.
- Lists use stable keys (`test.id`, `challenge.id`), never the index.
- Interactive elements are `button`/`a`/`input`, never a clickable `div`.

## Performance

Don't reach for `React.memo`, `useMemo` or `useCallback` by default. Use them when a measured slow render exists, or when a stable reference is needed for an effect dependency (like `run` above).
