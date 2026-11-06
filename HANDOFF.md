# Handoff - BugHunter Arena (2026-11-06, evening)

Deadline: public deploy on Render by **Sat 2026-11-07 12:00 CET**.

## Where the project is

**Live:**
- Client: https://bughunter-arena.onrender.com
- API: https://bughunter-arena-api.onrender.com

Both are deployed from `main` with `render.yaml`.

Everything below is merged into `main` and pushed. Lint passes and all tests pass: server 872, client 534.

| Area | State |
| --- | --- |
| Core flow | Done. Challenges, in-browser Python tests (Pyodide worker), graded hints, AI evaluation with a non-AI fallback, server-side scoring, progress |
| English | Done. All UI, server messages, challenge content and AI prompts. Difficulty is `easy` / `medium` / `hard` |
| New dark design | Landing (`/`) and problems (`/problems`) done. Dashboard (`/dashboard`) not yet checked against the mockup in `client/docs/refs/Design-project/` |
| Accounts (Phase 2) | Built, reviewed (security, database, React) and deployed. API verified in production with curl; browser check still to do (see next section) |
| Hunter profiles | Built: `/u/:handle` (public), `/profile` redirects to your own profile |
| XP and ranks | Server-computed, see `docs/SCORING.md` "XP and ranks" |

### Accounts in short
- **Server only:** the server calls Supabase Auth. The client never talks to Supabase and holds no Supabase key.
- **Endpoints:** `POST /api/auth/signup | login | refresh | logout`, `GET /api/me`, `GET /api/profiles/:handle`. Contract: `docs/API.md`.
- **Signup:** uses `auth.admin.createUser` with the service key. In the Supabase dashboard, "Confirm email" and "Allow new users to sign up" are **off**, on purpose.
- **Login and refresh:** use `SUPABASE_ANON_KEY` (the publishable key), server-side only.
- **Tokens:** sent as `Authorization: Bearer`. The client stores the session in localStorage under `bha.session` and refreshes it a minute before it expires.
- **Guests:** guest play with a display name still works. Signup can claim the guest's progress on that device (`claimUserId`; the response has `claimed: true/false`).
- **Ownership:** an account's attempts and progress need that account's token. Without it, an account id is treated as unknown.
- **Rules:**
  - Handles: `^[a-z0-9_]{3,20}$`, with reserved words.
  - Passwords: 10 to 72 characters.
  - Accepted risks: no email verification, and signup returns `409 EMAIL_TAKEN`.
- **Database:** migration `supabase/migrations/20261106200000_user_accounts.sql` is **pushed to production**.
- **Kill switch:** set `VITE_AUTH_ENABLED=false` on the static site and redeploy. This hides login, signup and profile, and guest play keeps working.

### XP rule (decided by the user)
- A challenge is solved by an attempt scoring at least 70.
- The XP for a challenge is the score of the **first** attempt that solved it. Retakes never add XP. An unsolved challenge gives 0.
- Ranks: Larva 0, Hunter 100, Exterminator 200, Arena Legend 300. These are the mockup names.

## Open right now

1. **Login in production: verified with curl** (2026-11-06, after `SUPABASE_ANON_KEY` was set on the Render API service).
   - Signup 201 (with `claimed`), `/api/me`, profile, login, wrong password 401, refresh, logout 204, progress with token, bad token 401, CORS preflight with `Authorization` 204: all passed.
   - **If login ever returns 503 again:** check the Render API logs for an `auth` warning with `kind: unavailable` and a status.
     - Status 401 or 403 means the key is wrong.
     - A warning at startup means the key is missing.
2. **Delete the smoke-test accounts** from Supabase. Do it in this order: the `attempts` rows, then the `users` row, then the auth user (Authentication > Users).
   - `smoke_151932` (`smoke_151932@example.com`)
   - `smoke_152646` (`smoke_152646@example.com`)
3. **Browser end-to-end on the live site:** sign up, solve `find-max`, and check that the profile shows 1 solved and the XP. Then log out and back in, check that guest play still works, and check claim at signup.

## Next steps, in order

1. Finish "Open right now" above.
2. **Supabase dashboard**, done by the project owner:
   - Raise the per-IP limits for sign-ins and token refresh (Authentication > Rate Limits). Every login comes from Render's single IP.
   - Optionally set the minimum password length to 10. The server already enforces it.
3. Check `/dashboard` against the new design.
4. Run `e2e-runner` (Playwright) on the user journeys plus an auth journey before the demo.
5. Wake the API before the demo. The Render free tier sleeps, and a cold start takes about 50 s.

## Known follow-ups (not blocking the deploy)

From the reviews of the accounts work:
- **XP window:** XP and progress read only the newest 1000 attempts per user. A later fix is a grouped SQL query.
- **Public profile cost:** `GET /api/profiles/:handle` is uncached, so consider a short cache or a stricter rate limit.
- **Login throttling:** it is per IP only, with no per-email throttle.
- **Signup recovery:** if signup creates the auth user but the row write and the rollback both fail, the email is stuck. It is logged at error level, but there is no automatic recovery.
- **Disabled buttons:** auth form buttons use `disabled` while pending. `aria-disabled` would be better for keyboard focus.
- **CSP:** the static site's CSP could be switched from Report-Only to enforcing after a full live solve.

Housekeeping:
- About 25 old agent worktrees in `.claude/worktrees/` and several old local branches can be removed.

## How to work in this repo

Read `CLAUDE.md` first: hard rules, commands, the agent table, and the reference docs.

- Docs: `docs/SPEC.md`, `docs/API.md` (the contract), `docs/DATA_MODEL.md`, `docs/SCORING.md`, `docs/PLAN.md`.
- Before finishing a change, run `npm run lint` and `npm test` in every folder you changed.
- Branches use GitHub Flow, and commits use Conventional Commits.
- `main` must stay deployable at every step.
- **Secrets** live only in `server/.env` locally and in the Render dashboard: `SUPABASE_SERVICE_KEY`, `LLM_API_KEY`, `LLM_API_URL`, `LLM_MODEL` and `SUPABASE_ANON_KEY`.
