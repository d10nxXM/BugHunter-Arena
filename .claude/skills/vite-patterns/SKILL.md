---
name: vite-patterns
description: Vite setup for BugHunter Arena's client - env variables, the dev proxy to the Express API, module Web Workers, serving Pyodide from public/, Monaco, and build checks. Use when touching vite.config.js, .env files, workers, static assets or when the build behaves unexpectedly.
---

# Vite patterns

## Environment variables

- Only variables prefixed `VITE_` reach the browser, and every one of them is public. The only one this app needs is `VITE_API_URL`.
- Secrets never go in `client/`, in any `.env` there, or behind a `VITE_` prefix. They live in `server/.env`.
- Read with `import.meta.env.VITE_API_URL`. Restart the dev server after changing `.env`.

```
# client/.env.development
VITE_API_URL=
```

Leave it empty in development and use the proxy below, so requests are same-origin and CORS doesn't get in the way.

## Dev proxy to the API

```js
// client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  worker: { format: 'es' },
});
```

Add the Tailwind integration according to the installed Tailwind version's Vite guide.

## Module workers

```js
const worker = new Worker(new URL('../workers/testRunner.worker.js', import.meta.url), { type: 'module' });
```

Use this exact form. Vite detects `new URL(..., import.meta.url)` and bundles the worker; a plain string path breaks in the production build.

## Pyodide from public/

The app must work without a CDN. Copy the Pyodide distribution files into `client/public/pyodide/` once, and load from there:

```js
// src/workers/testRunner.worker.js
import { loadPyodide } from 'pyodide';

const pyodideReady = loadPyodide({ indexURL: '/pyodide/' });
pyodideReady.then(() => self.postMessage({ type: 'ready' }));

self.onmessage = async (e) => {
  if (e.data.type !== 'run') return;
  const pyodide = await pyodideReady;
  const results = runTests(pyodide, e.data); // per-test try/except, JSON-compare results
  self.postMessage({ type: 'result', results });
};
```

- Keep the Pyodide npm package and the files in `public/pyodide/` the same version.
- Files in `public/` are served as-is at the root and are not processed by Vite; reference them with absolute paths (`/pyodide/...`).
- The worker starts at app load and stays alive, so Pyodide loads once. Loading takes seconds and is not counted in the 3 s test budget. The page side (`useTestRunner` in `react-patterns`) times each run and replaces the worker only after a timeout.

## Monaco editor

Use the editor package's documented Vite setup for its language workers. If they fail to load, the editor still renders but without highlighting; fix the worker config instead of switching editors.

## Build checks

```bash
npm run build     # must succeed with no warnings you can't explain
npm run preview   # serves dist/ to check the production build, worker and Pyodide paths
```

Things to check in the preview: the worker loads, Pyodide loads from `/pyodide/`, and no secret appears in `dist/` (`grep -r "sk-" dist` is empty).

## Pitfalls

- `process.env` in client code: undefined in the browser. Use `import.meta.env`.
- Importing a server file into the client: pulls Node-only code and maybe secrets into the bundle.
- Huge chunks: lazy-load the Dashboard route with `React.lazy` if the main chunk grows past a few hundred KB.
