---
name: verification-loop
description: Final verification before calling work done in BugHunter Arena - build, lint, tests, contract and leak checks, security grep, diff review, then a PASS/FAIL report. Use after finishing a feature or fix, before committing, and before a demo.
---

# Verification loop

Run the phases in order. Stop at the first FAIL, fix it, and start again from that phase.

## Phase 1: Build

```bash
cd client && npm run build
```

The server has no build step; instead check it starts:

```bash
cd server && node --check src/index.js && node -e "import('./src/app.js').then(() => console.log('app loads'))"
```

## Phase 2: Lint

```bash
cd client && npm run lint
cd server && npm run lint
```

Zero errors. Warnings explained or fixed.

## Phase 3: Tests

```bash
cd server && npm test
cd client && npm test            # once client tests exist
```

Report passed/failed counts. For scoring or fallback changes, also run `npm run coverage` in `server/`.

## Phase 4: Contract and leaks

- Changed a route? `docs/API.md` matches it (field names, status codes, error codes).
- Changed scoring? The worked example in `docs/SCORING.md` still equals 89 in the test.
- Public challenge endpoints still return no hidden fields (contract test or e2e `security.spec.js`).

## Phase 5: Security grep

```bash
grep -rn "sk-\|SUPABASE_SERVICE_KEY\|LLM_API_KEY" client/src client/dist 2>/dev/null
grep -rnE "eval\(|new Function\(|child_process" server/src
grep -rn "dangerouslySetInnerHTML" client/src
grep -rn "console.log" server/src client/src
```

All empty, or each hit explained (e.g. the startup log line).

## Phase 6: Diff review

```bash
git status
git diff --stat
git diff
```

Look for: unintended files (`.env`, `dist/`, debug files), leftover `console.log`, commented-out code, TODOs without an owner, docs not updated alongside code.

## Phase 7: Flow check (user-visible changes only)

Run the affected e2e journey (`npx playwright test e2e/<journey>.spec.js`) or, if e2e isn't set up yet, do it by hand in the browser: open find_max, submit the known-good answer, see the expected score.

## Report

```
VERIFICATION REPORT
Build:     PASS | FAIL
Lint:      PASS | FAIL (client: x errors, server: y errors)
Tests:     PASS | FAIL (server n/m, client n/m)
Contract:  PASS | FAIL | N/A
Security:  PASS | FAIL (x findings)
Diff:      n files changed, nothing unintended | issues listed
Flow:      PASS | FAIL | NOT RUN (reason)
Overall:   READY | NOT READY

To fix:
1. ...
```

"Ready" means every phase passed or is N/A with a reason. Never report READY with a phase skipped silently.
