# BugHunter Arena - Roadmap and build plan

Rewritten 2026-11-13. The university course is over; the project is now maintained by one person. This file replaces the course build plan (M1-M4, workers A-F). The old plan is in git: `git show 9080623:docs/PLAN.md`.

## Frame

| | |
| --- | --- |
| Owner | One maintainer, about 15 h per week, no deadline |
| Priorities | Learning, then portfolio, then real product. No real users yet |
| Budget | 0 EUR: Render free web service + static site, Supabase free, Gemini free tier |
| Language | Everything stays English |
| Workflow | The agent tree stays (`backend-orchestrator`, `backend-lead`, specialists). One human reviews and merges |
| Order | Phase A portfolio-ready, Phase B more languages, Phase C ready for real users, Phase D server-side runner (optional, local learning) |

## How to read this plan

- A **milestone** is 1-2 weeks of 15 h. Do one milestone at a time.
- A milestone is split into **areas**. An area is one worker with its own files. No file is owned by two areas of the same milestone.
- Each area is written as a brief the orchestrator can copy: goal, builder agent, reviewers, owned files, must not touch, done when, verification, dependencies.
- A file marked **(new)** does not exist yet. Every other path exists on `main` today.
- "Contract step" means: `planner` drafts the doc change, the owner approves, `docs-sync` writes it, and it is merged **before** any area starts. Areas never edit `docs/`; they report a needed change instead.

### Rules for one reviewer

- At most **two** areas run in parallel (the orchestrator allows three; one person cannot review three diffs well).
- Every merge to `main` is read by the owner first: the diff, the lead's report, the test numbers.
- Merge one branch at a time, run lint and tests on `main` after each merge, then start the next.
- Stop a milestone at its time box. Unfinished items go to the Backlog section, not into the next milestone silently.
- The orchestrator never pushes. The owner pushes `main`; Render deploys from it. Migrations are pushed with `npx supabase db push --remote` **before** the server code that needs them.

### Who runs what

| Work | How it runs |
| --- | --- |
| Server areas | `claude --agent backend-orchestrator`, one `backend-lead` per area in its own worktree |
| Client areas | Main session delegates to `frontend-dev` or `test-runner` on a feature branch, then `react-reviewer` and `code-reviewer` |
| Docs | `planner` then `docs-sync` (contract step), `docs-sync` again after the merge |
| Challenge content | Main session with the `add-challenge` skill, one id list per worker |
| Tools under `tools/` | Main session, plain Python, never from `server/` |

Foundation check for the orchestrator (its step 3): the M1 foundation is merged. Every router is registered in `server/src/app.js` and `server/src/services/evaluationService.js` exists.

### Shared files

No area owns these. They change only in a contract step or a "shared files" step, done by the main session before the areas start.

| File | Changes when |
| --- | --- |
| `docs/API.md`, `docs/DATA_MODEL.md`, `docs/SCORING.md`, `docs/SPEC.md` | Contract step of a milestone |
| `CLAUDE.md`, `.claude/rules/*.md`, `.claude/agents/*.md`, `.claude/skills/**` | Owner decision, between milestones |
| `server/package.json`, `client/package.json`, `e2e/package.json` and their lock files | Shared files step. A worker names a needed dependency or script in its report |
| `server/src/app.js` | Shared files step, when a milestone adds a router |
| `server/test/fakeSupabase.js`, `server/test/integration.test.js` | One named area per milestone |
| `client/src/App.jsx`, `client/src/paths.js`, `client/src/api/**`, `client/src/components/Layout.jsx` | One named area per milestone |
| `supabase/migrations/` | One named area per milestone. New files only, never edit a pushed migration |
| `render.yaml`, `server/.env.example` | One named area per milestone |

### Verification commands

Every area ends with the `verification-loop` skill for the folders it changed.

| Folder | Commands |
| --- | --- |
| `server/` | `npm run lint`, `npm test`, `npm run validate:challenges` |
| `client/` | `npm run lint`, `npm test`, `npm run build`, then `grep -rl jsdelivr dist/assets` must print nothing |
| `e2e/` | `npm test` (starts its own servers; needs `server/.env` for Supabase) |
| `tools/` | `python -B -m unittest discover tools` |
| AI changes | `npm run eval` in `server/` (uses the real LLM key and free-tier quota) |

## Status on 2026-11-13

Done and live on Render (`main` at `9080623`):

- Full solve flow: challenge list with filters, challenge page (Monaco, line selection, explanation, edge case, fix), visible tests in the browser (Pyodide in a Web Worker, 3 s timeout), submit and lock, hidden tests, server scoring, result page, dashboard.
- AI mentor: hints and explanation evaluation through an OpenAI-compatible endpoint (Gemini), with timeout, keyword fallback and demo mode. Evaluation set of 6 cases, last recorded run 2026-11-03 with `gemini-3.5-flash-lite`: all pass.
- Accounts (signup, login, refresh, logout), guest play, guest claim at signup, public profiles, server-computed XP and ranks.
- Leaderboard with global position on the profile and the dashboard (merged 2026-11-12, migration `20261112090000_leaderboard.sql` pushed).
- English everywhere, dark design, mobile menu.
- 3 Python challenges: `find-max`, `remove-negatives`, `binary-search`.
- Tests: server 903, client 567, e2e 7 journeys (solve, hints, infinite loop, dashboard, validation, AI fallback) at the last recorded runs.
- Deployment: `render.yaml` (API + static site), security headers, `.gitattributes` for LF.

Not there yet:

- No CI (`.github/` does not exist). No `LICENSE` file.
- AI hints call the LLM on every request.
- The CSP on the static site is still `Content-Security-Policy-Report-Only` (`render.yaml`).
- Only Python runs. The schema allows `javascript`, nothing else does.
- No account deletion, password reset, privacy policy, error tracking or backup.

### Open items carried over from the old plan

| Item | Goes to |
| --- | --- |
| Confirm the accounts migration `20261106200000_user_accounts.sql` is pushed (accounts work on production, so it should be; the old checkbox was never ticked) | A0 |
| Confirm `SUPABASE_ANON_KEY` is set on the Render API service | A0 |
| Supabase dashboard: minimum password length 10; raise the per-IP sign-in and token-refresh limits | A0 |
| Check `/leaderboard` on the live site after the merge | A0 |
| Enforce the CSP (rename the Report-Only header after a clean full solve on the live site) | A2 |
| `monaco-editor` 0.57.0 vendored `dompurify` advisory, accepted risk. Bump Monaco when it ships `dompurify` 3.4.17 or later, then re-check `client/README.md` Audit notes | A2 |
| A hint that arrives after the answer is locked is dropped silently (`client/src/hooks/useHints.js`) | A1 |
| The e2e suite does not clean up the attempts and display names it creates | A5 |
| `eslint-plugin-jsx-a11y` deferred until it supports ESLint 10 | A5 (re-check), else Backlog |
| Challenges 4-6 from `docs/SPEC.md` (`count_in_range`, `average`, `fizzbuzz`) | A4 |
| Challenge 7 `topThree` (JavaScript) | B2 |
| Migration to drop the redundant `attempts_user_id_idx` | A4a |
| `GET /api/attempts/:id` (recover feedback text and anonymous attempts); idempotency keys only if duplicates become a problem | C3 |
| Profile `totalXp` reads the newest 1000 attempts, the leaderboard reads all | Backlog |
| Fallback weakness: two keyword groups without the cause group still give quality 7 | Decision D9 |
| FR-22 feedback rating (`attempts.feedback_rating` exists, no endpoint writes it) | C3 |
| Owner decision: the client-side "solved" label | Decision D10 |
| Owner decision: labels for weak categories (was "Montenegrin labels"; now only whether to rename the English ones) | Decision D10 |

## Open decisions for the owner

Each one blocks the milestone named in the last column. The recommendation is what this plan assumes until the owner says otherwise.

| # | Decision | Options | Recommendation | Blocks |
| --- | --- | --- | --- | --- |
| D1 | How the hint cache is filled | (a) Pre-generate with a script; a request never calls the LLM. (b) Fill on the first request, then serve from the cache | (a). The request path gets faster and simpler, hints stop using AI quota, and the author can read every AI hint before students see it | A1 |
| D2 | Student text in hints | Today `aiService.getHint` sends `currentAnswer.explanation` to the model when present, and the client always sends it. Caching per (challenge, level) means removing it | **Decided 2026-11-13: remove it.** Accept and ignore `currentAnswer` on the server for one release, stop sending it from the client | A1 |
| D3 | Leaderboard integrity | (1) Label the leaderboard practice-only. (2) Add server-side plausibility checks | (1) now, plus the cheap consistency checks from (2) as bug guards, not as anti-cheat. Real fairness needs Phase D. Details in A3 | A3 |
| D4 | Where security findings are written | (a) A gitignored local file until fixed. (b) In the repo | (a) if the GitHub repo is public: do not publish an unfixed finding. Commit a summary after the fixes | A2 |
| D5 | Project licence | MIT, Apache-2.0, or none | MIT. Needed before importing licensed datasets and for a portfolio repo | A4a |
| D6 | New bug category names | `docs/SPEC.md` says a new category needs the owner's confirmation. 40-50 challenges need more than 7 categories | Approve a list once, in the A4a contract step, instead of one by one | A4a |
| D7 | Rank thresholds | Arena Legend is 300 XP. With 48 challenges the maximum is 4800 XP, so three solves reach the top rank | Rescale in `docs/SCORING.md` when the second content batch lands (for example 0 / 300 / 1000 / 2500). Existing accounts drop in rank name, not in XP | A4c |
| D8 | Supabase for e2e in CI | (a) Local Supabase stack in the CI job (`npx supabase start`). (b) A second free Supabase project with secrets in GitHub | (a). No secrets in CI, no test data in production, and it ends the "suite does not clean up" problem | A5 |
| D9 | Keyword fallback weakness | Require the cause group for quality 7, or leave it | Require it. Small `docs/SCORING.md` change, done with A3 because both touch scoring | A3 |
| D10 | "Solved" label and weak-category labels | Carried over, never decided | Decide during A5 while writing the README screenshots, or drop both | A5 |
| D11 | Gemini free tier and real users | The free tier's terms may allow Google to use prompts for product improvement and may restrict serving users in the EEA, UK and Switzerland. Not verified here | Read the current terms before C1. Until then the README says "demo, no real users" | C1 |
| D12 | Password reset and email verification | Out of scope in `docs/SPEC.md`. Needs outgoing email (Supabase's built-in sender is heavily rate limited) | Decide in C1. Account deletion does not depend on it | C1 |
| D13 | TypeScript challenges | Needs a type-stripping step in the browser, so a new dependency | Decide after B2, based on how the JavaScript runner turned out | B3 |
| D14 | Phase D hosting | Judge0 needs privileged Docker; Render free cannot run it | Local only at first. Hosting is a later, separate decision | D |

---

# Phase A - Portfolio-ready

Goal: a stranger can open the repo and the live site and see a finished, tested, explained project with enough content to try.

| Milestone | Contents | Size |
| --- | --- | --- |
| A0 | Housekeeping, minimal CI | 1 week, mostly owner hands-on |
| A1 | Hint caching | 1-2 weeks |
| A2 | Security review, then fixes by severity | 2-3 weeks |
| A3 | Leaderboard integrity | 1 week |
| A4a | Challenge format, attribution, importer | 2 weeks |
| A4b-A4d | Three content batches, about 15 challenges each | 3 x 1-2 weeks |
| A5 | Full CI with e2e, README, architecture, demo video | 2 weeks |

A0 has no dependencies on A1 and can run next to it. A2 comes after A1 so the review covers the new hint path. A4 comes after A1 because every new challenge gets pre-generated hints.

## A0 - Housekeeping and minimal CI

Not an orchestrator batch. The owner does these by hand or in one main session.

| Step | What | Files |
| --- | --- | --- |
| 1 | Close the four ops items from "Open items" (migration list, Render env, Supabase dashboard, live `/leaderboard` check) | none (dashboards). `npx supabase migration list --remote` |
| 2 | Delete stale branches: 25 `worktree-agent-*` branches and their worktrees, plus merged feature branches | none (`git worktree prune`, `git branch -d`) |
| 3 | **Done 2026-11-13.** Fix agent and skill text that still says Montenegrin, `lako/srednje/teško` or "two-person team" | `.claude/skills/add-challenge/SKILL.md`, `.claude/skills/api-contract/SKILL.md`, `.claude/skills/error-handling/SKILL.md`, `.claude/skills/git-workflow/SKILL.md`, `.claude/agents/{ai-integration,code-reviewer,frontend-dev,react-reviewer,test-runner}.md` |
| 4 | Roadmap table in `docs/SPEC.md` follows this plan (phases A-D); "Challenge author (team)" becomes the owner | `docs/SPEC.md` (`docs-sync`) |
| 5 | Minimal CI: lint and tests for `server/` and `client/`, `validate:challenges`, client build, tools unit tests. No e2e yet (A5) | `.github/workflows/ci.yml` (new) |

Step 5 is here, not in A5, because every later milestone merges agent-written code and CI is the cheapest second reviewer. `server/vitest.config.js` already sets a fake `SUPABASE_URL`, so the server job should need no secrets; confirm on the first run.

Agents: `docs-sync` (step 4), `build-error-resolver` if the CI run fails.
Done when: the four ops items are ticked here with a date; `git branch` shows only `main` and live work; no file under `.claude/` asks for Montenegrin text; CI is green on `main`.

## A1 - Hint caching

Goal: `POST /api/challenges/:id/hints` never calls the LLM. AI hints are generated ahead of time, once per (challenge, level), stored, and served from the store. The response shape, the one-level-per-response rule and the written-hint fallback stay.

What the code does today (the reason for D2): `server/src/prompts/hint.md` and `aiService.getHint` include `<student_answer>` when `currentAnswer.explanation` is a string, and `client/src/hooks/useHints.js` always sends one. So hints are not yet a pure function of (challenge, level). This milestone makes them one.

Design (assumes D1 = a, D2 = remove):

- New table `hint_cache`: `challenge_id` (references `challenges`, on delete cascade), `level` 1-3, `hint`, `input_hash`, `model`, `created_at`; primary key (`challenge_id`, `level`). RLS on, no policies.
- `input_hash` is a SHA-256 over the hint prompt text, the challenge's description, category, code, reference solution and that level's written hint. A row whose hash does not match the current challenge is ignored, so editing a challenge or the prompt can never serve a stale hint.
- Generation: `server/scripts/generate-hints.js` (new), run by hand as `npm run hints:generate`. For each challenge and level without a valid row it calls `aiService.getHint` (8 s timeout, no retry, output schema, `revealsSolution` check), then upserts. A failed call stores nothing and is listed at the end. Options: `--challenge <id>`, `--force`, `--dry-run`. Calls are sequential with a pause, to stay inside the free-tier rate limit.
- Request path in `hintService.getHint`: demo mode returns the recorded hint as today. Otherwise read the cache (short in-memory copy in front of the table, read timeout as in `leaderboardService`). Valid row: `source: "ai"`. No row, stale row or read failure: the written hint, `source: "written"`.
- `aiLimiter` comes off the hints route, because no hint request calls the LLM. The general limit stays.
- The script calls no child process and runs no challenge code, so the tripwire test in `server/test/integration.test.js` stays valid.

### Contract step (before the areas)

`planner`, then `docs-sync`:

- `docs/API.md`: hints section (`currentAnswer` accepted and ignored, then removed; meaning of `source: "ai"`; no AI timeout on the request), Rate limits (the AI limit applies to evaluation only), order of checks.
- `docs/DATA_MODEL.md`: `hint_cache` table, migration row, RLS note.
- `docs/SPEC.md`: Hints paragraph ("the AI may adapt them to the student's current answer" goes away), FR-11 wording.
- `.claude/rules/backend.md` (AI calls: hints) and `.claude/agents/ai-integration.md`.
- Shared files: add `"hints:generate": "node scripts/generate-hints.js"` to `server/package.json`.

### Area A1-1 - Hint cache and generation (server)

```
Area: A1-1 - Hint cache and generation
Builder agent: ai-integration, test-first with tdd-guide for hintService and the hash
Reviewers: code-reviewer, security-reviewer, silent-failure-hunter, database-reviewer
Owned files:
  server/src/services/hintService.js (+ its tests)
  server/src/services/aiService.js (getHint only: drop currentAnswer) (+ its tests)
  server/src/prompts/hint.md
  server/src/routes/hints.js, hints.test.js, hints.ai.test.js, hints.rateLimit.test.js
  server/src/db/hintCache.js (new) (+ test)
  server/scripts/generate-hints.js (new) (+ test)
  supabase/migrations/<timestamp>_hint_cache.sql (new)
  server/test/fakeSupabase.js (only if the new table needs it)
Must not touch: evaluation path (evaluationService, fallbackService, evaluation.md), scoring,
  attempts, app.js, package.json, docs/
Goal: FR-11 with no per-request LLM call (hard rules 3, 5, 6)
Done when:
  - a hint request makes zero LLM calls (test: llmClient mock is never called from the route)
  - valid cached row -> source "ai"; missing, stale-hash or failed read -> written hint, 200
  - demo mode unchanged; one level per response; hidden fields never in the response
  - the script skips valid rows, stores nothing on timeout, bad output or a leaking hint,
    and prints a per-challenge summary without prompt text or keys
  - the hints route no longer consumes AI quota; evaluation still does
  - parity test for ai / written / demo sources passes (ai-regression-testing skill)
  - lint and npm test pass
Branch name to report: the worktree branch you are on
```

### Area A1-2 - Client hints (client)

- Goal: stop sending student text with a hint request; tell the student when a late hint was dropped.
- Builder: `frontend-dev`. Reviewers: `react-reviewer`, `code-reviewer`.
- Owned files: `client/src/hooks/useHints.js`, `client/src/components/HintPanel.jsx`, `client/src/api/client.js` (`requestHint` only), `client/src/api/mocks/fixtures.js` and `mocks/index.js` (hint fixture only), `client/src/pages/ChallengePage.hints.test.jsx`.
- Must not touch: workers, submit flow, other API functions.
- Done when: the request body is `{ level }`; `mocks.test.js` still matches `docs/API.md`; a hint that arrives after the lock shows a short notice instead of nothing, and `hintsUsed` still equals the hints shown; lint, tests and build pass.

### Area A1-3 - e2e and release (after A1-1 and A1-2 are merged)

- Agent: `e2e-runner`. Owned files: `e2e/hints.spec.js`, `e2e/pages/ChallengePage.js`.
- Release order (owner): push the migration, deploy, run `npm run hints:generate` locally against production, read the nine generated hints, check one on the live site.
- Then `docs-sync` and `npm run eval` (the evaluation prompt did not change; this confirms nothing else moved).

Dependencies: A1-1 and A1-2 are independent and run in parallel. A1-3 needs both.

If the owner picks D1 (b) instead: `hintService` calls the LLM on a cache miss and writes the result; `aiLimiter` stays on the route and counts only misses; the script becomes an optional warm-up. Everything else is the same.

## A2 - Security review and fixes

Defensive review only. No attacking, scanning or load testing of the live site.

### A2a - Review (1 week, read-only)

Reviewers report, they do not edit. Run them in parallel from the main session, each with one scope, so no report is shallow:

| Scope | Agent | Reads |
| --- | --- | --- |
| API surface | `security-reviewer` | `server/src/routes/`, `middleware/`, `schemas/`, `app.js`, `lib/config.js`, `lib/logger.js` |
| Auth and data access | `security-reviewer`, `database-reviewer` | `server/src/services/authService.js`, `middleware/auth.js`, `server/src/db/`, `supabase/migrations/` (RLS, grants, `leaderboard_xp()`) |
| AI path | `security-reviewer` | `aiService.js`, `llmClient.js`, `hintService.js`, `evaluationService.js`, `fallbackService.js`, `prompts/`, `schemas/aiOutput.js`, `scripts/generate-hints.js` |
| Browser | `security-reviewer`, `react-reviewer` | `client/src/workers/`, `client/src/api/`, `client/src/lib/session.js`, auth context, every place AI or student text is rendered |
| Failure handling | `silent-failure-hunter` | every try/catch, fallback and timeout in `server/src/` and `client/src/workers/` |
| Deployment and dependencies | `security-reviewer` | `render.yaml`, `.env.example` files, `.gitignore`, `npm audit` in `server/`, `client/` and `e2e/`, `tools/` |

Known inputs to hand to the reviewers: the Trust model and Accepted risks in `docs/API.md`, the Report-Only CSP, the Monaco `dompurify` advisory, the guest id rules.

Output: one findings table (severity, `file:line`, issue, impact, fix, status), written by the main session to the place chosen in D4.

Done when: every scope has a report; each finding has a severity and an owner area; findings that are already documented accepted risks are marked so, not re-opened.

### A2b - Fixes (1-2 weeks, time-boxed)

One finding at a time, CRITICAL first, then HIGH, then MEDIUM. Per finding:

1. Regression test first, named after the bug (`tdd-guide`, `ai-regression-testing` skill).
2. Smallest fix, by the agent that owns the file: `backend-dev`, `ai-integration`, `frontend-dev` or `test-runner`.
3. `security-reviewer` re-checks that finding only; `code-reviewer` on the diff.
4. Owner merges. One branch per finding, or per group of findings in the same file.

Already known, do these whatever the review says:

- Enforce the CSP: full solve on the live site with the console open, then rename the header in `render.yaml`.
- Re-check the Monaco `dompurify` advisory; bump `monaco-editor` if a fixed release exists.
- `npm audit --audit-level=high` clean in all three packages, or each exception written down in `client/README.md` Audit notes.

Findings in different files can run as parallel orchestrator areas; the owned-files list of each area is the files named in its findings. Findings in the same file are done in sequence.

Docs to update: `docs/API.md` (Trust model, Accepted risks, Response headers), `.claude/rules/security.md` if a rule changes, `README.md` deployment notes.
Done when: no open CRITICAL or HIGH; every MEDIUM is fixed or listed as an accepted risk with a reason; the security-reviewer verdict on `main` is PASS; CI is green.
Dependencies: A1 merged.

## A3 - Leaderboard integrity

Blocked by D3. What can and cannot be faked today (`docs/API.md`, Trust model):

- Locked before any secret is shown, so trustworthy: selected lines, explanation, edge case, fixed code. They decide up to 40 + 30 points.
- Reported by the browser after the lock, so fakeable: test results (10 points), the edge-case outputs (20 points), `hintsUsed` (up to 20 points of penalty), duration (display only).

| Option | What it is | Cost | What it gives |
| --- | --- | --- | --- |
| 1. Label | "Practice leaderboard" wording on `/leaderboard`, the landing teaser and the profile, with one sentence on why (code runs in your browser). Same in `docs/SPEC.md` and the README | 2-3 h, client and docs only | Honest. No false promise. Good portfolio story |
| 2. Plausibility checks | Server checks in `attemptService`: every challenge test id reported exactly once (a missing test counts as failed); `passed: true` only when `actual` equals `expected` as JSON; `edgeCaseCheck.referenceOutput` consistent with a challenge test when the same input exists; a floor on duration; mark an attempt `unverified` and leave it off the leaderboard instead of rejecting it | 1-2 weeks, scoring and schema change | Catches client bugs and lazy tampering. Does not stop anyone who reads the response of `POST /api/attempts`, which contains every expected value |
| 3. Server-verified attempts | Re-run the locked fix in an isolated runner | Phase D | The only real fix |

Recommendation: option 1, plus the first two checks of option 2 as correctness guards (they are cheap and make scoring match its own rules), plus D9. Do not build duration floors or hint counting; they add state and stop nobody.

Areas if the recommendation is accepted:

- Contract step: `docs/SCORING.md` (fix rule: missing results count as failed, `actual` is re-checked; fallback cause-group rule if D9), `docs/API.md` (evaluation validation, Trust model), `docs/SPEC.md` (Known limitations, FR-28 wording).
- **A3-1 Scoring guards (server).** Builder: `backend-dev` with `tdd-guide`. Reviewers: `code-reviewer`, `security-reviewer`. Owned: `server/src/services/scoringService.js`, `server/src/services/attemptService.js`, `server/src/services/fallbackService.js` (D9 only), `server/src/schemas/attempt.js`, their tests. Must not touch: routes, db, AI services. Done when: every changed rule in `docs/SCORING.md` has a Vitest case; the worked example still scores 89; no stored attempt changes score (rules apply to new evaluations only).
- **A3-2 Practice label (client).** Builder: `frontend-dev`. Reviewer: `react-reviewer`. Owned: `client/src/pages/Leaderboard.jsx`, `client/src/components/leaderboard/*`, `client/src/components/landing/ArenaTeaser.jsx`, `client/src/pages/Leaderboard.test.jsx`. Done when: the label is visible without scrolling, readable by screen readers, and the tests cover it.

The two areas are independent. Verification: server and client commands, then `e2e` solve journey.

## A4 - From 3 to 40-50 Python challenges

### A4a - Format, attribution and importer (2 weeks)

Decisions needed first: D5 (licence), D6 (categories).

Contract step:

- `docs/DATA_MODEL.md`: new optional challenge field `source`: `{ dataset, task_id, license, url, changes }`, or `null` for original challenges. New column `challenges.source jsonb`. Validation rule: when present, all five keys are non-empty strings and `license` is on an allow-list (`MIT`, `CC-BY-4.0`; extended only after a licence check). `source` is public.
- `docs/API.md`: `GET /api/challenges/:id` returns `source` (attribution must be visible to the user for CC BY). It is not a hidden field.
- `docs/SPEC.md`: bug category list from D6; the importer in "Challenge author"; NFR-13 wording.
- Before any import, check each dataset's licence file at the source and write the result here. Planned: HumanEval (MIT), MBPP (CC BY 4.0). Any other dataset only after the same check.

| Area | Goal | Builder and reviewers | Owned files | Done when |
| --- | --- | --- | --- | --- |
| A4a-1 Challenge format (server) | `source` end to end; drop the redundant index | `backend-dev` + `tdd-guide`; `code-reviewer`, `database-reviewer`, `security-reviewer` | `server/src/schemas/challenge.js`, `server/src/db/challenges.js`, `server/src/services/challengeService.js`, `server/src/routes/challenges.js`, `server/scripts/seed.js`, `server/scripts/validate-challenges.js`, their tests, `supabase/migrations/<timestamp>_challenge_source.sql` (new), `supabase/migrations/<timestamp>_drop_attempts_user_id_idx.sql` (new), `server/test/integration.test.js` (tripwire also names `import-challenges`) | the three existing files validate unchanged; a file with a bad or missing-key `source` fails validation; `source` is in the detail response; the leak test still passes; the tripwire fails if `server/` mentions the importer |
| A4a-2 Importer (tools) | Turn dataset tasks into draft challenge files | main session, plain Python; `code-reviewer`, `security-reviewer` | `tools/import-challenges.py` (new), `tools/test_import_challenges.py` (new), `tools/drafts/` (new, gitignored through `.gitignore`) | see below |
| A4a-3 Attribution in the UI (client) | Show "Adapted from <dataset> (<licence>)" on the challenge page | `frontend-dev`; `react-reviewer` | `client/src/components/ChallengeWorkspace.jsx`, `client/src/api/mocks/fixtures.js` (challenge fixture), one test file | text and link render only when `source` is set; the link is a plain `<a>` with `rel="noreferrer"`; never rendered as HTML |
| A4a-4 Author docs | The `add-challenge` skill describes the import path | owner | `.claude/skills/add-challenge/SKILL.md`, `LICENSE` (new, D5), `README.md` (credits section) | the skill has an "from a draft" path: review, inject one bug, lines, hints, keywords, feedback, `check-challenge.py`, `validate:challenges`, `seed`, `hints:generate` |

Importer design (A4a-2):

- `python tools/import-challenges.py --dataset humaneval|mbpp --input <local dataset file> --language python [--ids ...] [--limit N] --out tools/drafts/`.
- Standard library only. It reads a file the owner downloaded by hand; it makes no network call.
- It **never executes** dataset code. Tests are read with `ast` and kept only when every argument and expected value is a JSON-representable literal. Tasks that need anything else (several functions, float tolerance, sets, exceptions as the expected result) are skipped and listed with the reason.
- A draft holds: `id`, `title`, `description`, `language`, `function_name`, `reference_solution` (the dataset's solution), `tests_json` without `failsOnOriginal`, `source` filled in, and empty placeholders for `code`, `bug_lines`, `related_lines`, `bug_category`, `bug_description`, `difficulty`, `hints_json`, `keywords_json`, `fallback_feedback`. A draft does not pass `validate:challenges` on purpose and never goes into `server/data/challenges/` unfinished.
- `--language` selects a small per-language module (function-name extraction, test parsing). Only `python` is implemented now; `javascript` is added in B2.
- Author tool: run by hand, never imported or run by `server/`. Dataset code is third-party code. Read a draft before running `tools/check-challenge.py` on it; that tool runs it with a minimal environment and a 3 s budget, which limits accidents, not malice.

Done when (A4a-2): unit tests cover both dataset formats, the skip reasons and the no-execution rule (a test with a task whose code would write a file proves nothing ran); a run on 20 real tasks produces drafts that load as JSON.

Dependencies: A4a-1 first (the format), then A4a-2 and A4a-3 in parallel. A4a-4 last. Verification: all commands in the table above.

### A4b, A4c, A4d - Content batches (each 1-2 weeks, about 15 challenges)

Target after A4d: 45-50 challenges, about 18 easy, 18 medium, 12 hard, every confirmed category with at least 3 challenges.

Per challenge (the `add-challenge` skill): pick or import, inject exactly one bug that ordinary inputs do not show, write `bug_lines`, `related_lines`, `bug_description`, 3 hints, 3 keyword groups, `fallback_feedback`; then `python tools/check-challenge.py <file>`, `npm run validate:challenges`, `npm run seed`, `npm run hints:generate -- --challenge <id>`.

Budget honestly: 30-45 minutes per challenge including the owner's review, so a batch is 8-11 h. `docs/SPEC.md` NFR-13 says under 15 minutes; update it or the number.

| Batch | Contents | Extra |
| --- | --- | --- |
| A4b | `count-in-range`, `average`, `fizzbuzz` (hand-written, from `docs/SPEC.md`) plus about 12 imported, mostly easy | First real use of the importer; fix what it gets wrong before A4c |
| A4c | About 15, mostly medium | D7 rank thresholds (contract step in `docs/SCORING.md`, then `scoringService.js` `rankForXp`, `client/src/lib/xp.js`, landing `RanksSection.jsx`); check the Problems page and dashboard with 30+ rows |
| A4d | About 15, medium and hard | Add 2-3 evaluation-set cases for new categories to `server/eval/explanations.json`, run `npm run eval`; record demo responses for 2-3 more challenges in `server/data/demo-responses.json` |

Areas inside a batch: at most two content workers, each with a fixed list of ids. A worker owns `server/data/challenges/<its ids>.json` and nothing else. The challenge table in `docs/SPEC.md` is updated once per batch by `docs-sync`.

Review per challenge (owner, this is the real bottleneck): one bug only; the visible tests pass on the buggy code; no hint, title or description gives the fix away; the explanation in `bug_description` is specific enough to grade against; `source.changes` says what was altered; read the three generated AI hints.

Done when (each batch): `check-challenge.py` passes on every file of the batch; `validate:challenges` passes; production is seeded and hints generated; one new challenge is solved by hand on the live site; CI is green.
Dependencies: A1 (hint generation), A4a.

## A5 - CI with e2e, README, architecture, demo (2 weeks)

| Area | Goal | Agents | Owned files | Done when |
| --- | --- | --- | --- | --- |
| A5-1 e2e journeys | Cover the main flow as it is now | `e2e-runner` | `e2e/*.spec.js`, `e2e/pages/*`, `e2e/support/*`, new `e2e/auth.spec.js` (new: sign up, solve, profile, leaderboard) | all journeys pass 3 runs in a row (`npm run test:repeat`), NFR-04 |
| A5-2 e2e in CI | Run the suite on every push | main session, `build-error-resolver` | `.github/workflows/ci.yml`, `e2e/playwright.config.js` | per D8: the job starts a local Supabase stack, applies `supabase/migrations/`, seeds, runs Playwright, uploads the HTML report on failure; no production secret in GitHub |
| A5-3 README | A stranger understands the project in two minutes | `docs-sync`, owner | `README.md`, `docs/media/` (new: screenshots and one GIF of a solve) | sections: what it is, live link, GIF, how it works, architecture diagram, key decisions, run locally, tests and CI badge, credits and licences |
| A5-4 Architecture and decisions | Explain the why | `planner` drafts, owner edits | `docs/ARCHITECTURE.md` (new) | a diagram (Mermaid: browser, worker, Express, Supabase, LLM, the two-call grading flow) and one short section per decision: browser-only execution, lock-then-reveal grading, AI capped at 30 points with a fallback, pre-generated hints, practice-only leaderboard |
| A5-5 Demo video | 2-3 minutes | owner | link in `README.md` | shows a solve with a hint, the result page, the fallback label, the leaderboard |

Also here: decide D10; re-check whether `eslint-plugin-jsx-a11y` supports ESLint 10 and add it to `client/eslint.config.js` if it does.

Dependencies: A5-1 before A5-2. A5-3 to A5-5 need A4 mostly done, so the screenshots show a full problem list. Verification: CI green on `main`, README links checked by hand.

**Phase A is done when:** CI is green with e2e; no open CRITICAL or HIGH finding; 45+ challenges live; the README, architecture page and video are published.

---

# Phase B - More languages

Goal: JavaScript works end to end, proven by real challenges. TypeScript is optional. Java, C++, Go and Rust only with Phase D.

What exists: `language` is `python | javascript` in the Zod schema and the database check; `client/src/lib/labels.js` has both labels; the two prompts (`hint.md`, `evaluation.md`) do not mention Python.

What is missing: a JavaScript runner worker; Monaco registers only Python (`client/src/workers/monacoSetup.js`) and `CodeEditor.jsx` hard-codes `language: 'python'`; the runner is not chosen by `challenge.language`; runner messages say "Python" (`runnerClient.js`); the editor title is always `<name>.py` (`ChallengeCodePanel.jsx`); the model is not told the language; `tools/check-challenge.py` skips non-Python files; the importer has no JavaScript module.

## B1 - JavaScript runner and plumbing (2 weeks)

Contract step: `docs/DATA_MODEL.md` (JavaScript `tests_json` rules: arguments and results are JSON values; `undefined`, `NaN`, `-0`, functions and class instances never match; `function_name` is a top-level function), `docs/SPEC.md` (FR-03, NFR-02, NFR-05 wording), `.claude/rules/frontend.md` and `CLAUDE.md` stack lines ("user code runs only in a browser Web Worker" instead of naming one file), `.claude/agents/test-runner.md`.

| Area | Goal | Builder and reviewers | Owned files | Done when |
| --- | --- | --- | --- | --- |
| B1-1 JS runner | Run JavaScript challenge code in a worker with the 3 s timeout | `test-runner`; `security-reviewer`, `react-reviewer`, `silent-failure-hunter` | `client/src/workers/jsRunner.worker.js` (new), `client/src/workers/jsHarness.js` (new) + test, `client/src/workers/runnerClient.js`, `client/src/hooks/useTestRunner.js`, `client/src/components/TestRunnerProvider.jsx`, `client/src/lib/compareResults.js`, `client/src/workers/noCdn.test.js` | same result shape as the Python runner; an infinite loop ends in a `timeout` result within 3 s and the next run works; the worker is created per run (no state between runs); Pyodide still loads at app start and JavaScript challenges do not wait for it; the worker cannot read the session (it has no `localStorage`) and CSP `connect-src` is unchanged |
| B1-2 Editor and page | Editor and labels follow `challenge.language` | `frontend-dev`; `react-reviewer` | `client/src/workers/monacoSetup.js` (register the JavaScript tokenizer only, no language worker; confirm the import path in `monaco-editor` 0.57.0), `client/src/components/CodeEditor.jsx`, `client/src/components/ChallengeCodePanel.jsx`, `client/src/lib/runnerPayload.js`, their tests | a JavaScript fixture challenge highlights, shows `<name>.js` and runs its visible tests; the bundle has no `jsdelivr` string and no TypeScript worker |
| B1-3 Server language awareness | The model and the validator know the language | `ai-integration`; `code-reviewer`, `security-reviewer` | `server/src/services/aiService.js` (a `<language>` tag in the challenge blocks), `server/src/prompts/*.md` (one line each), `server/scripts/validate-challenges.js`, `server/eval/explanations.json` (JavaScript cases, after B2 has a challenge), tests | `npm run eval` passes; the hint `input_hash` includes the language; existing Python hints are regenerated once |
| B1-4 Author check for JS | `tools/check-challenge.py` checks JavaScript files | main session; `code-reviewer`, `security-reviewer` | `tools/check-challenge.py`, `tools/test_check_challenge.py` | a JavaScript challenge runs through a local `node` child process with the same rules: one process per code string, 3 s budget, minimal environment, process tree killed, JSON comparison as in `docs/DATA_MODEL.md`; the Python path is unchanged. The tool stays outside `server/` |

B1-1 and B1-2 share the runner interface: settle it in the contract step (`.claude/agents/test-runner.md`), then run them in parallel. B1-3 and B1-4 are independent of both.

Verification: client and server commands, `python -B -m unittest discover tools`, and a temporary JavaScript challenge solved by hand in the browser (not seeded to production).

## B2 - JavaScript content (1-2 weeks)

- Importer: `--language javascript` module in `tools/import-challenges.py`. Candidate sources are JavaScript translations of the Python benchmarks; check each one's licence first and add it to the allow-list in the A4a contract only then.
- 10-15 JavaScript challenges through the same pipeline, starting with `top-three` (`docs/SPEC.md` challenge 7, category "Default function behavior").
- `e2e/solve-js.spec.js` (new): one JavaScript solve; language filter on the Problems page.
- Profile "Solved by language" now shows two rows; check it.

Done when: JavaScript challenges are live, hints generated, CI green including the new journey.
Dependencies: B1, A4a.

## B3 - TypeScript (optional, D13)

Only if B1 and B2 went smoothly. Needs: a type-stripping step in the browser (a new dependency: say why, and check its size and licence), the `typescript` value in the Zod schema and a migration for the database check, the Monaco TypeScript tokenizer without its language worker. Plan it in detail when the decision is made.

---

# Phase C - Ready for real users

Goal: a person who is not the owner can use the site safely, leave, and be heard. Still 0 EUR.

Free-plan facts to design around: the Render free API sleeps after about 15 minutes idle (`README.md`); Supabase free projects are paused after a period without activity and have no downloadable automatic backups (confirm both in the dashboard before C2).

## C1 - Accounts people can leave, and the legal minimum (2 weeks)

Decisions first: D11, D12.

- Contract step: `docs/API.md` (`DELETE /api/me`, Bearer, password confirmation), `docs/DATA_MODEL.md` (`auth_user_id` is `on delete restrict` today; choose between deleting the user's attempts and keeping them without a user), `docs/SPEC.md` (out-of-scope list), `.claude/rules/security.md` (Privacy).
- **C1-1 Account deletion (server).** `backend-dev` + `tdd-guide`; `security-reviewer`, `database-reviewer`. Owned: `server/src/routes/me.js`, `server/src/services/authService.js`, `server/src/db/auth.js`, `server/src/db/users.js`, `server/src/schemas/auth.js`, tests, one migration (new). Done when: the account, its Supabase Auth user and its attempts are gone or detached as decided; the handle leaves the leaderboard at once (cache invalidated); nothing about the deleted user is logged except an event without identifiers.
- **C1-2 Account settings and policy pages (client).** `frontend-dev`; `react-reviewer`. Owned: `client/src/pages/Privacy.jsx` (new), `client/src/pages/AccountSettings.jsx` (new), `client/src/api/client.js` (one function), `client/src/App.jsx`, `client/src/paths.js`, `client/src/components/landing/LandingFooter.jsx`. Done when: delete needs a typed confirmation; the privacy page says what is stored, that explanations go to an LLM provider without identifiers, and how to delete an account.
- Password reset only if D12 says yes; it becomes its own milestone.

## C2 - Seeing problems and surviving them (1-2 weeks)

- **C2-1 Error tracking.** A free-tier error tracker for server and client. New dependency: justify it. Server DSN in `server/.env` and `.env.example`; the client DSN is public by nature. Scrubbing is the work: no request bodies, no `Authorization` header, no student text, no email (`.claude/rules/security.md`). Update the CSP `connect-src` in `render.yaml`. `security-reviewer` must pass it.
- **C2-2 Keep-alive and uptime.** A free external pinger on `/healthz` (already unrate-limited). Add a second, rare request that touches the database so the Supabase project stays active.
- **C2-3 Backup.** A documented manual routine first: `npx supabase db dump` to the owner's machine on a schedule, with a restore test once. Do **not** upload dumps as GitHub Actions artifacts if the repo is public. Automate only with private storage.
- Owned files: `server/src/lib/logger.js`, `server/src/middleware/errorHandler.js`, `server/src/index.js`, `client/src/main.jsx`, `client/src/components/ErrorBoundary.jsx`, `render.yaml`, `README.md` (operations section).

## C3 - Listening and first-run experience (2 weeks)

- **Feedback.** FR-22: `POST /api/attempts/:id/rating` writing `attempts.feedback_rating` (column exists). A general feedback form: start with a link to GitHub Issues or a hosted form (no code); a `feedback` table only if that proves too thin.
- **Analytics without personal data.** No third-party script. Aggregate counts from our own tables (attempts per day, solve rate and hint use per challenge, fallback share), read by a script `server/scripts/stats.js` (new) run by hand. A dashboard page is optional.
- **Onboarding.** First-visit walkthrough on `find-max`; NFR-09 check with one real test user (first challenge in under 10 minutes without help).
- **Recovery.** `GET /api/attempts/:id` from the old plan: summary plus `feedback`, `testsPassed`, `testsTotal`, no hidden fields; the planner adds it to `docs/API.md` first.

Areas are cut when the milestone starts; the contract step lists the endpoints. Agents: `planner`, `backend-dev`, `frontend-dev`, `e2e-runner`, the reviewers.

**Phase C is done when:** an account can be deleted from the UI; errors reach the tracker with no personal data; a restore from a dump has been tried once; a new user has finished a challenge unaided.

---

# Phase D - Server-side runner and a fair leaderboard (optional, learning)

This phase conflicts with the 0 EUR budget if hosted. Plan and build it locally; hosting is D14.

- **D1 Design and rule change.** `docs/ARCHITECTURE.md` section and a contract step. Hard rule 1 in `CLAUDE.md` changes from "never execute user-submitted code on the server" to "never in the Express process; only in an isolated runner service". The same change in `.claude/rules/security.md`, `docs/SPEC.md` (NFR-05, Out of scope, Known limitations) and the tripwire in `server/test/integration.test.js` (Express still has no `child_process`).
- **D2 Local runner.** A self-hosted Judge0 (or similar) in Docker under `runner/` (new: compose file and notes). Express talks to it over HTTP through one module, `server/src/services/runnerClient.js` (new), behind `RUNNER_URL` in `server/.env`. Unset means the feature is off and the app behaves as today (hard rule 6 pattern: timeout and fallback to browser results).
- **D3 Verified attempts.** After the lock, the server re-runs the fixed code and the edge case in the runner and marks the attempt `verified`. The leaderboard counts verified attempts only; the practice label from A3 goes away where verification is on. Contract changes in all four docs.
- **D4 Compiled languages.** Java, C++, Go, Rust challenges become possible only here, with the runner as the only executor and the importer's `--language` modules.

---

## Backlog (not scheduled)

- Profile `totalXp` (newest 1000 attempts) can differ from the leaderboard (all attempts) for very active accounts.
- `eslint-plugin-jsx-a11y`, if still blocked on ESLint 10 at A5.
- Idempotency keys for `POST /api/attempts`, only if duplicate submissions show up.
- Leaderboard beyond 1000 ranked accounts (PostgREST `max-rows`).
- Teacher panel, groups, classroom features (old SPEC phase 2 and 3).
- Profile editing (`users.bio` exists, unused).
