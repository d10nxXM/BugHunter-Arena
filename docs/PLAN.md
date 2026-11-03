# BugHunter Arena - Build plan

The work is split so several agents can run at once without editing the same files. Each worker owns a set of files; shared files are settled before parallel work starts.

## Milestones

| Milestone | Mode | Contents | Done when |
| --- | --- | --- | --- |
| M1 Foundation | One agent at a time | Server foundation; client shell; route and page stubs | `main` runs, both shells start, stubs registered |
| M2 Features | Parallel workers A-F | Everything in the worker tables below | Each worker's branch reviewed and merged |
| M3 Integration | One agent | Replace client mocks with the real API; full find_max flow | Solve journey passes end to end |
| M4 Hardening | Parallel reviewers | e2e journeys, security review, AI evaluation set, more challenges | Verification loop READY |

## M1: what must exist before parallel work

Server foundation (first Claude Code task):
- `app.js`, `index.js`, config, AppError, error and validation middleware, rate limits
- Supabase client, seed script, `GET /api/health`, `GET /api/challenges`, `GET /api/challenges/:id`

Shell completion (so M2 workers never edit shared files):
- `server/src/app.js` registers every router: challenges, hints, attempts, progress, users. Routers not built yet return `501 NOT_IMPLEMENTED`.
- `server/src/services/evaluationService.js` stub exporting `evaluateExplanation()` that returns the fallback shape.
- `client/src/App.jsx` with all routes and placeholder pages: ChallengeList, ChallengePage, ResultView, Dashboard.
- `client/src/api/client.js` and `client/src/api/mocks/` matching every example in `docs/API.md`.
- Every dependency the workers will need is installed in both `package.json` files.

## M2 workers

### Backend

| Worker | Agent | Owns | Must not touch |
| --- | --- | --- | --- |
| A Challenges and hints | backend-dev | `routes/challenges.js`, `routes/hints.js` (batch 1 only; moves to C in batch 2), `db/challenges.js`, `services/challengeService.js`, `scripts/seed.js`, `scripts/validate-challenges.js`, `data/challenges/` | `app.js`, attempts, AI services |
| B Attempts and scoring | backend-dev + tdd-guide | `routes/attempts.js`, `routes/progress.js`, `db/attempts.js`, `services/scoringService.js`, `services/attemptService.js`, `schemas/attempt.js` | `app.js`, AI services, `docs/SCORING.md`, `db/challenges.js` (calls `getFullChallenge` only) |
| C AI mentor | ai-integration | `services/llmClient.js`, `aiService.js`, `evaluationService.js`, `fallbackService.js`, `prompts/`, `data/demo-responses.json`, `eval/`, `routes/hints.js` (batch 2, from A) | Routes except `routes/hints.js` in batch 2, scoring, db |

B calls `evaluateExplanation()` from C's interface; until C is merged, the M1 stub returns the fallback shape.

A added a server-only `getFullChallenge(id)` in `db/challenges.js`. It returns the full challenge row, hidden fields included. B calls it from the attempts service (`services/attemptService.js`) only. No public route may use it.

A shipped written hints only (`source: "written"`). In batch 2, C wires `routes/hints.js` to `aiService.getHint()`; the written hint stays the fallback. Ownership of `routes/hints.js` moves from A to C for that batch.

### Frontend

| Worker | Agent | Owns | Must not touch |
| --- | --- | --- | --- |
| D Editor and runner | test-runner | `workers/`, `hooks/useTestRunner.js`, `lib/compareResults.js`, `components/CodeEditor.jsx`, `public/pyodide/` | Pages, `App.jsx`, `api/` |
| E Challenge flow | frontend-dev | `pages/ChallengeList.jsx`, `pages/ChallengePage.jsx`, `components/AnswerForm.jsx`, `components/HintPanel.jsx` | `App.jsx`, `api/`, D's files |
| F Results and progress | frontend-dev | `pages/ResultView.jsx`, `pages/Dashboard.jsx`, `components/ScoreBreakdown.jsx`, `components/TestResults.jsx` | `App.jsx`, `api/`, D's and E's files |

E uses D's `<CodeEditor>` and `useTestRunner()` through the interfaces in `.claude/agents/test-runner.md`. Until D is merged, E uses a temporary `<textarea>` and a mocked `useTestRunner`.

## Shared files

| File | Who may change it | When |
| --- | --- | --- |
| `docs/API.md`, `docs/SCORING.md`, `docs/DATA_MODEL.md` | planner, then docs-sync | Before M2, or between batches |
| `server/src/app.js`, `client/src/App.jsx` | M1 only | Never during M2 |
| `package.json`, `package-lock.json` | M1 only | A worker that needs a dependency names it in its summary instead of installing |
| `supabase/migrations/` | One worker per batch, named in the batch prompt | Pushed after merge |

## Running a batch

Run at most three workers at a time; each one multiplies usage. Suggested batches:

1. A, B, D (core data and the runner)
2. C, E, F (mentor and the screens)

After each batch: `code-reviewer` on every branch, merge one at a time, run tests on `main` after each merge, then start the next batch from the updated `main`.
