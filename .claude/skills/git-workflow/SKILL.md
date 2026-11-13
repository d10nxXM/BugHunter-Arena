---
name: git-workflow
description: Git conventions for BugHunter Arena (one maintainer plus agents) - GitHub Flow branches, Conventional Commits, merging with the verification report, rebasing a feature branch, and resolving conflicts in docs/API.md. Use when committing, branching, opening a PR, or resolving a merge conflict.
---

# Git workflow

## Branches (GitHub Flow)

- `main` always works: lint and tests pass, the solve flow runs.
- One short-lived branch per change: `feat/hint-panel`, `fix/scoring-related-lines`, `docs/api-hints`, `chore/eslint-a11y`.
- One maintainer: the owner reads the diff and the verification report, then merges into `main` with `git merge --no-ff <branch>` (or through a pull request when CI should run first). Agent work is reviewed by the reviewer agents before the owner sees it.
- Only the owner pushes `main`; Render deploys from it.

```bash
git switch main && git pull
git switch -c feat/hint-panel
# work, commit
git push -u origin feat/hint-panel
```

## Commits: Conventional Commits

```
<type>(<scope>): <summary in imperative, max ~72 chars>

<why, if not obvious>
```

| Type | Use for |
| --- | --- |
| feat | New behavior for the student |
| fix | Bug fix |
| test | Tests only |
| docs | `docs/`, README, CLAUDE.md, agent files |
| refactor | No behavior change |
| chore | Tooling, dependencies, config |

Scopes: `client`, `server`, `scoring`, `ai`, `worker`, `db`, `challenges`, `agents`.

Good: `feat(server): add hint endpoint with level ordering`
Good: `fix(scoring): give 20 points for related line only`
Bad: `update`, `fixes`, `wip`, `changes to stuff`

- One logical change per commit. Don't mix a refactor with a feature.
- Never commit `.env`, `dist/`, `node_modules/` or debug files. Check `git status` before every commit.
- A contract change (`docs/API.md`) and the code that implements it go in the same PR.

## Pull requests

Title in commit format. Body:

```markdown
## What
<one paragraph>

## Why
<requirement id or bug id>

## Contract changes
docs/API.md / DATA_MODEL.md / SCORING.md: <what, or "none">

## Verification
<paste the report from the verification-loop skill>

## Screenshots
<for UI changes>
```

Reviewer checklist: hard rules in `CLAUDE.md` kept, docs updated, tests added for new logic, no secrets or hidden fields exposed.

## Keeping a branch current

On your own unshared branch, rebase for a clean history:

```bash
git fetch origin
git rebase origin/main
# resolve conflicts, then
git push --force-with-lease
```

Never rebase `main` or a branch someone else is also committing to; merge instead. Use `--force-with-lease`, never plain `--force`.

## Conflicts

```bash
git status                 # lists conflicted files
# edit, keep both intentions, remove markers
git add <file>
git rebase --continue      # or git merge --continue
```

`docs/API.md` conflicts are the important ones: two branches (often two parallel agent areas) changed the contract. Don't just pick one side; settle the final shape, then update the code on both sides to match it.

Avoid conflicts by keeping branches short, merging one at a time, and making contract changes in a contract step before parallel areas start (see `docs/PLAN.md`).

## Undo safely

| Situation | Command |
| --- | --- |
| Unstage a file | `git restore --staged <file>` |
| Discard local changes to a file | `git restore <file>` |
| Fix the last commit message (not pushed) | `git commit --amend` |
| Undo a pushed commit | `git revert <sha>` (never rewrite shared history) |
