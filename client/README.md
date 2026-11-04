# BugHunter Arena - client

React 19 + Vite 8 + Tailwind CSS 4. Student code runs only in a Web Worker with Pyodide, loaded from
`public/pyodide/` (no CDN). The editor is Monaco from the local `monaco-editor` package.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Copies Pyodide (predev), then the Vite dev server on http://localhost:5173 |
| `npm run build` | Copies Pyodide (prebuild), then builds to `dist/` |
| `npm run preview` | Serves `dist/`, with the same `/api` proxy as dev |
| `npm test` | Vitest once (jsdom, React Testing Library) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run pyodide:copy` | Copies the Pyodide core files from `node_modules/pyodide` to `public/pyodide/` |

## API and proxy

All server calls go through `src/api/client.js`. In dev and preview, `/api` is proxied to the
Express server on http://localhost:3000 (start it with `npm run dev` in `server/`). Timeouts: 10 s
by default, 12 s for hints, 20 s for the evaluation (the server's AI fallback can take about 16 s).

## Environment variables

Every `VITE_` variable is public: Vite inlines it into the browser bundle. Never put a secret in
`client/`. Secrets live only in `server/.env`. Defaults are in `.env.development`; override them in
`.env.local` (gitignored). See `.env.example`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_URL` | empty | API base URL. Empty means same origin (`/api` through the proxy) |
| `VITE_USE_MOCKS` | `false` | `true` answers every call from `src/api/mocks/`, no server needed |
| `VITE_MOCK_EVALUATION` | `ai` | Mocks only: `fallback` returns the evaluation without AI |

## Mocks

`src/api/mocks/fixtures.js` holds the JSON examples from `docs/API.md`; `src/api/mocks/mocks.test.js`
fails if a fixture and the doc differ. Change the doc first, then the fixture. GET and hint fixtures
never contain the reference solution, bug lines or hidden tests; only the `POST /api/attempts`
response does.

Run with mocks: put `VITE_USE_MOCKS=true` in `.env.local` and restart `npm run dev`.

## Pyodide

`scripts/copy-pyodide.mjs` copies `pyodide.mjs`, `pyodide.asm.mjs`, `pyodide.asm.wasm`,
`python_stdlib.zip` and `pyodide-lock.json` to `public/pyodide/` and writes a version marker. It
skips the copy when the marker matches the installed version. `public/pyodide/` is gitignored and
never edited by hand. `pyodide` is pinned to an exact version in `package.json`.

## Layout

- `src/App.jsx` - routes (fixed after M1)
- `src/paths.js` - route paths and the `ResultState` passed to the result page
- `src/api/` - API client and mocks
- `src/pages/` - ChallengeList, ChallengePage, ResultView, Dashboard, NotFound
- `src/components/` - Layout, CodeEditor, TestRunnerProvider and the feature components
- `src/hooks/` - `useTestRunner`, `useUser`
- `src/context/` - user context (display name and id in `localStorage` key `bha.user`)
