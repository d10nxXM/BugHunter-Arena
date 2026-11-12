# BugHunter Arena

A learning platform where students find, explain and fix a deliberate bug in short code challenges. The AI is a mentor: it gives graded hints and evaluates the student's explanation, but never writes the fix.

**Live:** client https://bughunter-arena.onrender.com · API https://bughunter-arena-api.onrender.com (both deployed from `main`)

## How it works

1. Pick a challenge: a short Python function with one deliberate bug.
2. Flag the bug line(s), explain the bug, give an edge case that exposes it, and fix the code.
3. Visible tests run in your browser before you submit. Hints are available at three levels, each with a point penalty.
4. On submit the server locks the attempt. Then all tests, including hidden ones, run in the browser on your fix.
5. The server scores the attempt out of 100 (`docs/SCORING.md`):

   | Component | Points | Checked by |
   | --- | --- | --- |
   | Bug identification | 40 | Server |
   | Explanation | 30 | AI, or a keyword fallback without the AI |
   | Edge case | 20 | Browser results, scored on the server |
   | Fix | 10 | Tests |

   Hints cost 5, 5 and 10 points.
6. Progress, XP and ranks: Larva, Hunter, Exterminator, Arena Legend. A challenge's XP is the score of the first attempt that solved it (score of at least 70).

Guests play with a display name. An account (handle, email and password) adds a public hunter profile at `/u/:handle` and a place on the leaderboard at `/leaderboard`.

## Stack

| Folder | Contents |
| --- | --- |
| `client/` | React 19, Vite, Tailwind CSS 4, Monaco editor. Python tests run with Pyodide inside a Web Worker, with a 3 s timeout |
| `server/` | Node.js (22 or newer), Express 5 (ES modules), Zod validation, Supabase (PostgreSQL and Auth), any OpenAI-compatible LLM API for hints and evaluation |
| `supabase/migrations/` | SQL schema and migrations |
| `e2e/` | Playwright end-to-end tests |
| `tools/check-challenge.py` | Author tool for checking a challenge with local Python. Run it by hand, never from `server/` |
| `docs/` | The specification and the contracts (see below) |

User code never runs on the server. Scores, XP and ranks are computed on the server only. The AI affects at most 30 of the 100 points, and the whole flow works when the LLM is unavailable.

## Getting started

Requirements: Node.js 22 or newer (Render uses 24), and a Supabase project to run against real data.

### Server

```bash
cd server
npm install
cp .env.example .env     # fill in the values, see below
npm run seed             # load data/challenges/*.json into Supabase
npm run dev              # http://localhost:3000
```

`server/.env` holds the secrets and the LLM settings. It is gitignored. Never put these values in client code.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Database access (service key, server only) |
| `SUPABASE_ANON_KEY` | Login and token refresh, server only. If empty, login returns 503 and guest play still works |
| `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` | OpenAI-compatible chat-completions endpoint. Tested: `gemini-3.5-flash-lite` on the Gemini OpenAI endpoint. After changing the model, run `npm run eval` |
| `DEMO_MODE` | `true` serves recorded AI answers and never calls the LLM |
| `ALLOWED_ORIGIN` | The only origin CORS accepts (`http://localhost:5173` in development) |
| `AI_TIMEOUT_MS`, `PORT`, `LOG_LEVEL` | Timeouts, port and logging |
| `TRUST_PROXY` | Number of reverse proxies in front of the server (an integer from 0 to 10; `1` on Render). Leave it empty when clients reach the server directly |

Apply the database schema with the Supabase CLI: `npx supabase db push --remote` (the files are in `supabase/migrations/`).

### Client

```bash
cd client
npm install
npm run dev              # http://localhost:5173, proxies /api to :3000
```

To run without a server, set `VITE_USE_MOCKS=true` in `client/.env.local`, and the mock API in `src/api/mocks/` answers every call. Every `VITE_` variable is public (it is built into the bundle). The variables are listed in `client/.env.example`, and `VITE_AUTH_ENABLED=false` hides accounts. `client/README.md` covers Pyodide and the no-CDN rules.

## Commands

| Folder | Command | What it does |
| --- | --- | --- |
| client | `npm run dev` | Vite dev server. Copies Pyodide to `public/pyodide/` first |
| client | `npm run build` | Production build into `dist/` |
| client | `npm test` | Vitest component and API client tests (jsdom) |
| server | `npm run dev` | API with restart on change |
| server | `npm test` | Vitest unit and integration tests (Supabase and the LLM are faked) |
| server | `npm run seed` | Loads the challenge JSON into Supabase |
| server | `npm run validate:challenges` | Checks the challenge JSON structure (runs no code) |
| server | `npm run eval` | Runs the AI evaluation set against the configured LLM |
| e2e | `npm run install:browsers`, then `npm test` | Playwright journeys. Starts its own servers in demo mode and in fallback mode (unreachable LLM). Needs `server/.env` for Supabase |
| client, server | `npm run lint`, `npm run format` | ESLint and Prettier |

## Documentation

| File | Contents |
| --- | --- |
| `docs/SPEC.md` | Users, flow, requirements, screens, scope |
| `docs/API.md` | The API contract: endpoints, request and response shapes, error codes, rate limits |
| `docs/DATA_MODEL.md` | Tables, SQL schema, migrations, challenge JSON format, derived data |
| `docs/SCORING.md` | Points, hint penalties, the fallback evaluation, XP, ranks and the leaderboard |
| `docs/PLAN.md` | Build plan, status and open checklists |
| `CLAUDE.md`, `.claude/` | Rules and agents for working on the repo with Claude Code |

Challenges live in `server/data/challenges/*.json` and AI prompts in `server/src/prompts/*.md`.

## Deployment (Render, free tier)

`render.yaml` defines both services:
- **API** (`bughunter-arena-api`): a Node web service with the health check `/healthz`.
- **Client** (`bughunter-arena`): a static site with an SPA rewrite and security headers.

To set it up:
1. Push `main` to GitHub. Render deploys from `main` automatically.
2. Create the services: in Render, choose New > Blueprint and pick this repo. Enter the secret values when asked: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `LLM_API_URL`, `LLM_API_KEY` and `LLM_MODEL`. They live only in the Render dashboard.
3. If Render gave a service a different URL, update `ALLOWED_ORIGIN`, `VITE_API_URL` and the CSP `connect-src`, then redeploy.
4. Push new migrations (`npx supabase db push --remote`) **before** the server code that needs them deploys.

Two things to know:
- The free API sleeps after about 15 minutes without traffic and takes about a minute to wake. To keep it awake, ping `https://<api>/healthz` every 10 minutes, for example with cron-job.org.
- The CSP starts as `Content-Security-Policy-Report-Only`. After a full solve on the live site shows no violations, rename it to `Content-Security-Policy`.

## Status (2026-11-12)

**Done and live:**
- The core flow.
- Three Python challenges (`find-max`, `remove-negatives`, `binary-search`).
- AI hints and evaluation, with a non-AI fallback.
- Accounts, hunter profiles, XP and ranks.
- The dark design on every page.

**On `feat/leaderboard`, not merged yet:**
- The leaderboard and global position.
- Before merging, push migration `20261112090000_leaderboard.sql` and check `leaderboard_xp()` on production data. The full checklist is in `docs/PLAN.md`.

**Open:**
- Run the e2e suite and do a browser check of the live site.
- In the Supabase dashboard, raise the per-IP limits for sign-in and token refresh (every login comes from Render's one IP).
- Delete the smoke-test accounts `smoke_151932` and `smoke_152646`.
- Switch the CSP to enforcing.
- Add a `.gitattributes` with `eol=lf`, so Prettier on Windows stops showing line-ending-only changes.

Later:
- XP and progress read only the newest 1000 attempts per user.
- Login throttling is per IP only.
- JavaScript challenges.
