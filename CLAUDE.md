# BugHunter Arena

Learning platform where students find, explain and fix a deliberate bug in short code challenges.
The AI is a mentor: it gives graded hints and evaluates the student's explanation. It never writes the fix for the student.

## Stack

- `client/` - React + Vite + Tailwind CSS, Monaco editor, Python tests run with Pyodide inside a Web Worker
- `server/` - Node.js + Express (ES modules), Zod validation, Supabase (PostgreSQL), LLM API for hints and evaluation
- Challenges are Python in the MVP. JavaScript challenges come later.

## Commands

| Folder | Command | What it does |
| --- | --- | --- |
| client | `npm run dev` | Vite dev server on http://localhost:5173 |
| server | `npm run dev` | API on http://localhost:3000 (`PORT` in `.env`), restarts on change |
| server | `npm test` | Vitest unit tests (scoring, validation) |
| both | `npm run lint` | ESLint |
| both | `npm run format` | Prettier |

## Hard rules

1. Never execute user-submitted code on the server. It runs only in the browser, in a Web Worker, with a 3 s timeout.
2. Secrets (`LLM_API_KEY`, `SUPABASE_SERVICE_KEY`) live only in `server/.env`. Never in client code, never committed, never logged.
3. Never send `reference_solution`, `bug_lines`, `related_lines`, `bug_description`, `keywords_json`, `hints_json`, `fallback_feedback` or hidden tests to the client before `POST /api/attempts` has locked the attempt.
4. Scores are computed on the server only and follow `docs/SCORING.md` exactly.
5. The AI affects at most 30 of 100 points. Student text is data inside `<student_answer>` tags, never instructions.
6. Every AI call has a timeout and a non-AI fallback. The full flow must complete with the LLM unavailable.
7. Before finishing a task, run `npm run lint` (and `npm test` for server changes) in each folder you changed.

## Reference docs

Read the relevant one before changing an API, the data model or scoring, and update it in the same change.

- `docs/SPEC.md` - users, flow, requirements, challenge set, scope
- `docs/API.md` - endpoints, request/response shapes, error codes
- `docs/DATA_MODEL.md` - tables, SQL schema, challenge JSON format
- `docs/SCORING.md` - point rules, hint penalties, fallback evaluation

Challenge data: `server/data/challenges/*.json`. AI prompts: `server/src/prompts/*.md`.

## Agents

Delegate to these in `.claude/agents/`. Reviewers report, they don't edit.

| When | Agent |
| --- | --- |
| Task spans client/server/docs, or changes API, schema or scoring | `planner` first |
| Server work | `backend-dev`, test-first with `tdd-guide` for logic |
| Client work | `frontend-dev` |
| After any change, before commit | `code-reviewer` |
| Routes, aiService, prompts, worker, CORS, new dependency | `security-reviewer` |
| `.jsx` and hooks | `react-reviewer` |
| Schema, migrations, queries | `database-reviewer` |
| try/catch, fallbacks, timeouts | `silent-failure-hunter` |
| Build, dev server, lint or install fails | `build-error-resolver` |
| User flow changed, before a release or demo | `e2e-runner` |
| Code changed something the docs describe | `docs-sync` |

## Skills

In `.claude/skills/`, loaded when the task matches: `add-challenge`, `api-contract`, `express-patterns`, `react-patterns`, `vite-patterns`, `react-testing`, `tdd-workflow`, `e2e-testing`, `postgres-supabase`, `security-review`, `error-handling`, `frontend-a11y`, `ai-regression-testing`, `verification-loop`, `git-workflow`.

Finish every task with the `verification-loop` checks for the folders you changed.

## Conventions

- UI text is Montenegrin. Code, identifiers, comments and commit messages are English.
- Keep changes small and focused. Say why before adding a new dependency.
- Prefer editing existing modules over creating parallel ones.
