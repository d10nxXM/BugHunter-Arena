# BugHunter Arena - API contract

Base path `/api`. All bodies are JSON. All user-facing text (challenge content, hints, feedback and error messages) is English. The server runs on `http://localhost:3000` in development.

Grading happens in two calls: `POST /api/attempts` locks the answer and only then returns all tests and the reference solution; the browser runs them and sends results to `POST /api/attempts/:id/evaluation`, which returns the score.

## Endpoints

| Method | Path | Purpose | Priority |
| --- | --- | --- | --- |
| GET | `/api/health` | Server status and AI availability | Must |
| GET | `/healthz` | Liveness check for the hosting platform; not rate limited | Must |
| GET | `/api/challenges` | Challenge list, no solutions or hidden tests | Must |
| GET | `/api/challenges/:id` | Description, code and visible tests | Must |
| POST | `/api/challenges/:id/hints` | Next hint (level 1-3) | Should |
| POST | `/api/attempts` | Submit answer; returns attempt id, all tests, reference solution | Must |
| POST | `/api/attempts/:id/evaluation` | Test results in; score and feedback out | Must |
| GET | `/api/progress?userId=` | Dashboard statistics | Should |
| GET | `/api/attempts?userId=&challengeId=&limit=&cursor=&cursorId=` | Attempt history | Could |
| POST | `/api/users` | Create a guest user with a display name | Could |
| POST | `/api/auth/signup` | Create an account (handle, email, password); returns a session | Should |
| POST | `/api/auth/login` | Log in with email and password; returns a session | Should |
| POST | `/api/auth/refresh` | New session from a refresh token | Should |
| POST | `/api/auth/logout` | Revoke the current session (Bearer) | Should |
| GET | `/api/me` | The logged-in account (Bearer) | Should |
| GET | `/api/profiles/:handle` | Public read-only hunter profile | Should |
| GET | `/api/leaderboard?limit=` | Public ranking of accounts by XP | Could |

## Authentication

Accounts are optional. Guests keep playing with a display name (`POST /api/users`). An account is a handle, an email and a password, managed by Supabase Auth through this API only; the client never talks to Supabase.

The client sends the access token from a session as `Authorization: Bearer <accessToken>`. No cookies are used. The scheme name is case-insensitive.

Optional auth (`POST /api/attempts`, `POST /api/attempts/:id/evaluation`, `GET /api/progress`, `GET /api/attempts`): no `Authorization` header means guest. A header that is present but malformed, invalid or expired returns `401 UNAUTHORIZED`. It never falls back to guest. The token is checked before body or query validation, so a bad token gets `401` and never uses AI quota.

Required auth (`POST /api/auth/logout`, `GET /api/me`): a missing header also returns `401 UNAUTHORIZED`.

A valid token whose Supabase user has no account row returns `401 UNAUTHORIZED`. If Supabase Auth does not answer within 5 s or is down, auth checks and auth endpoints return `503 AUTH_UNAVAILABLE`. So does a server misconfiguration: when Supabase rejects the server's own service or anon key (401/403) on signup, login or refresh, the response is `503`, never a `401` the user could act on.

Session object (`expiresAt` is epoch seconds; the access token lives about 1 h, the refresh token rotates on every refresh):

```json
{ "accessToken": "eyJ...", "refreshToken": "v1.abc...", "expiresAt": 1793980800 }
```

Account object. `id` is the `users.id` UUID, the same value guests store as `userId`. `displayName` equals the handle. `memberSince` is the row's `created_at`:

```json
{ "id": "6c1f9a0e-2b3d-4e5f-8a9b-0c1d2e3f4a5b", "handle": "dion_m", "displayName": "dion_m", "memberSince": "2026-11-06T18:00:00.000000+00:00" }
```

No endpoint returns an email or a password. Tokens appear only in the session of the auth responses below.

## GET /api/health

```json
{ "status": "ok", "ai": "available", "demoMode": false }
```

`ai` is `available`, `unavailable` or `demo`.

## GET /healthz

```json
{ "status": "ok" }
```

For the hosting platform's health check and uptime pingers. It is outside `/api`, so it skips CORS, the request log and the rate limits, and frequent checks never get `429`. It says nothing about the AI or the database. Use `GET /api/health` for that.

## GET /api/challenges

```json
[
  {
    "id": "find-max",
    "title": "Largest number in a list",
    "language": "python",
    "difficulty": "easy",
    "bugCategory": "Wrong initialization"
  }
]
```

## GET /api/challenges/:id

Never includes `reference_solution`, `bug_lines`, `related_lines`, `bug_description`, `keywords_json`, `hints_json`, `fallback_feedback` or hidden tests.

```json
{
  "id": "find-max",
  "title": "Largest number in a list",
  "description": "The function find_max returns the largest number in a list. For an empty list it returns None.",
  "language": "python",
  "difficulty": "easy",
  "bugCategory": "Wrong initialization",
  "functionName": "find_max",
  "code": "def find_max(numbers):\n    max_value = 0\n    for number in numbers:\n        if number > max_value:\n            max_value = number\n    return max_value",
  "visibleTests": [
    { "id": "t1", "args": [[2, 5, 1]], "expected": 5 },
    { "id": "t2", "args": [[7]], "expected": 7 }
  ],
  "hintCount": 3
}
```

## POST /api/challenges/:id/hints

Request:

```json
{ "level": 1, "currentAnswer": { "selectedLines": [], "explanation": "" } }
```

Response:

```json
{ "level": 1, "hint": "Does the function work for every list of numbers, or only for typical ones?", "source": "written" }
```

`level` must be an integer 1-3. Any other value, including `"1"` or `1.5`, returns `400 VALIDATION_ERROR`. An unknown challenge returns `404 NOT_FOUND`.

The server does not enforce hint order or count. Any `level` 1-3 is served, and each response holds one level. The client asks for one more than the hints already used and reports `hintsUsed` in `POST /api/attempts`. That count is not checked against the hints served (see Trust model). Practice use only.

`currentAnswer` is optional. If present it must be an object. `selectedLines` is an optional array of at most 10 positive integers. `explanation` is an optional string of at most 1000 characters, with no minimum. Unknown keys are dropped. Anything else returns `400 VALIDATION_ERROR` before any AI call.

Only `explanation` reaches the model. `<` and `>` are escaped and the text is placed inside `<student_answer>` tags as data. `selectedLines` is validated but not sent. The model also gets the task, the bug category, the numbered buggy code and the written hint for that level. It never gets the bug description, bug lines, keywords or reference solution. `currentAnswer` is never stored, logged or returned.

`source` is one of:

- `ai`: generated by the LLM for this request.
- `written`: `hints_json[level - 1]` from the challenge. Used when the AI is not configured, when loading the challenge for the AI hint fails, and as the fallback when the AI call fails, times out (8 s, or `AI_TIMEOUT_MS` if lower), returns unusable output, or returns a hint that contains a backtick or a line of the reference solution.
- `demo`: the recorded hint from `data/demo-responses.json` when `DEMO_MODE=true`. A challenge with no recorded hint gets the written hint, with `source: "written"`.

Hint requests are rate limited as described in Rate limits.

## POST /api/attempts

Request:

```json
{
  "challengeId": "find-max",
  "userId": null,
  "selectedLines": [2],
  "explanation": "max_value starts at 0. If every number is negative, none of them is greater than 0, so the function returns 0, and 0 is not in the list.",
  "edgeCase": { "args": [[-8, -3, -10]], "expected": -3 },
  "fixedCode": "def find_max(numbers):\n    if not numbers:\n        return None\n    max_value = numbers[0]\n    ...",
  "hintsUsed": 1,
  "durationSec": 184
}
```

Validation:
- `challengeId` matches `[a-z0-9-]{1,64}`.
- `userId` is a UUID or `null`; omitted means `null`. With a valid Bearer token, `userId` may be omitted, `null` or the token's own `users.id`; the attempt is stored under the account. Any other value returns `403 FORBIDDEN`.
- `selectedLines` is 1-10 positive integers. Duplicates are removed.
- `explanation` is 20-1000 characters after trimming.
- `edgeCase` is `{ args: JSON array, expected: JSON value }`.
- `fixedCode` is up to 5000 characters.
- `hintsUsed` is an integer 0-3.
- `durationSec` is a finite number >= 0 with no upper limit. It is stored rounded to whole seconds and capped at 2147483647.

Unknown keys are dropped.

Errors: `404 NOT_FOUND` for an unknown `challengeId`, and for a `userId` that does not exist. Without a token, a `userId` that belongs to an account also returns `404 NOT_FOUND` (the same response as an unknown user). `401 UNAUTHORIZED` for a bad token, `403 FORBIDDEN` for a `userId` that does not match the token. In all these cases nothing is stored and no tests or solution are returned.

Response `201 Created`:

```json
{
  "attemptId": "a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "tests": [
    { "id": "t1", "args": [[2, 5, 1]], "expected": 5, "visible": true },
    { "id": "t2", "args": [[7]], "expected": 7, "visible": true },
    { "id": "t3", "args": [[-8, -3, -10]], "expected": -3, "visible": false },
    { "id": "t4", "args": [[]], "expected": null, "visible": false }
  ],
  "referenceSolution": "def find_max(numbers): ..."
}
```

## POST /api/attempts/:id/evaluation

Request. `edgeCaseCheck` holds what the original code and the reference solution return for the student's edge-case input; if the original code raised, `originalOutput` is `null` and `error` holds the error text.

```json
{
  "testResults": [
    { "id": "t1", "passed": true, "actual": 5 },
    { "id": "t2", "passed": true, "actual": 7 },
    { "id": "t3", "passed": true, "actual": -3 },
    { "id": "t4", "passed": true, "actual": null }
  ],
  "edgeCaseCheck": { "originalOutput": 0, "referenceOutput": -3, "error": null }
}
```

A test that times out is `{ "id": "t3", "passed": false, "actual": null, "error": "timeout" }`.

Validation:
- The path id must be a UUID.
- `testResults` is an array of at most 100 items. Each item is `{ id: string 1-64 chars, passed: boolean, actual?: JSON value, error?: string up to 200 chars or null }`.
- `edgeCaseCheck` is required: `{ originalOutput: JSON value, referenceOutput: JSON value, error?: string up to 200 chars or null }`. A non-empty `edgeCaseCheck.error` means the original code raised for the edge case. The reference solution is trusted not to raise (see `docs/SCORING.md`).

Invalid input returns `400 VALIDATION_ERROR`. It is checked before the AI rate limit, so a `400` never uses AI quota. An unknown attempt returns `404 NOT_FOUND`. An attempt that belongs to an account also returns `404 NOT_FOUND` unless the request carries that account's token. Guest attempts (and attempts without a user) can be evaluated by anyone who knows the attempt id. An attempt that is already evaluated returns `409 ALREADY_EVALUATED` (error envelope only; see Timeouts and retries).

Response `200 OK`:

```json
{
  "score": 89,
  "breakdown": { "lineIdentification": 40, "explanation": 24, "edgeCase": 20, "fix": 10, "hintPenalty": -5 },
  "testsPassed": 4,
  "testsTotal": 4,
  "feedbackSource": "ai",
  "feedback": {
    "is_correct": true,
    "explanation_quality": 8,
    "detected_misconception": "Assuming the list always contains at least one positive number.",
    "needs_clarification": false,
    "hint": null,
    "feedback": "You correctly spotted that the starting value 0 causes a problem when every number is negative. Good job confirming it with the test [-8, -3, -10]. For full marks, also describe what happens with an empty list.",
    "practice_tip": "When you look for the largest or smallest element, start from the first element of the list, not from an arbitrary constant."
  }
}
```

`feedbackSource` is `ai`, `fallback` or `demo`. With `fallback`, `feedback` has the same fields, with these values (rules in `docs/SCORING.md`, "Fallback without the AI"):

- `is_correct`: `true` when `explanation_quality >= 7`, else `false`
- `explanation_quality`: from the keyword groups (0, 3, 7 or 10)
- `detected_misconception`: `null`
- `needs_clarification`: `false`
- `hint`: `null`
- `feedback`: the challenge's `fallback_feedback`, or, if it is missing or blank, the generic text `Assessed without AI: the explanation was scored by key terms.`
- `practice_tip`: `null`

Known weakness: two matched keyword groups without the cause group still give quality 7 and `is_correct: true`.

## GET /api/progress?userId=

```json
{
  "totalScore": 245,
  "totalXp": 241,
  "solved": 3,
  "attempted": 4,
  "averageDurationSec": 212,
  "perChallenge": [{ "challengeId": "find-max", "bestScore": 89, "attempts": 2, "xp": 85 }],
  "weakCategories": [{ "category": "Wrong initialization", "misses": 2 }]
}
```

Definitions are in `docs/DATA_MODEL.md` under derived data. `totalXp` and `perChallenge[].xp` follow `docs/SCORING.md`, "XP and ranks": XP is the score of the first solving attempt, not the best score, and is 0 for an unsolved challenge.

Without a token, `userId` is required and must be a UUID; otherwise `400 VALIDATION_ERROR`. With a valid Bearer token, `userId` may be omitted or must equal the token's `users.id` (`403 FORBIDDEN` otherwise). An unknown user, a user with no attempts, or an account's id sent without its token gets `200` with zeros and empty lists: `{ "totalScore": 0, "totalXp": 0, "solved": 0, "attempted": 0, "averageDurationSec": 0, "perChallenge": [], "weakCategories": [] }`. Progress is computed from the user's newest 1000 attempts.

## GET /api/attempts?userId=&challengeId=&limit=&cursor=&cursorId=

- `userId` is required and must be a UUID when no token is sent. With a valid Bearer token it may be omitted or must equal the token's `users.id` (`403 FORBIDDEN` otherwise). An account's id sent without its token is treated as an unknown user (`[]`).
- `challengeId` is optional (`[a-z0-9-]{1,64}`) and restricts the list to one challenge.
- `limit` is optional: an integer 1-100, default 50.
- `cursor` and `cursorId` are optional: the `createdAt` (ISO 8601 with offset, URL-encoded, sent back exactly as received) and the `id` of the last item of the previous page. With both, only attempts ordered after that item are returned (`createdAt` earlier, or equal `createdAt` and smaller `id`), so no attempt is skipped or repeated. `cursor` alone returns attempts created strictly before it (kept for compatibility; may skip attempts that share a `createdAt`). `cursorId` without `cursor` returns `400 VALIDATION_ERROR`.

Known limitation (`cursor` only): an attempt with exactly the same `createdAt` as the cursor is skipped. This needs two attempts by one user in the same microsecond. Send `cursorId` with `cursor` to avoid it.

Invalid values return `400 VALIDATION_ERROR`.

Response `200 OK`: a bare JSON array, newest first (by `createdAt`, then `id`), with at most `limit` items. Fewer than `limit` items means there are no more pages. A client that sends neither `limit` nor `cursor` gets the newest 50. An unknown user gets `[]`.

```json
[
  {
    "id": "a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    "challengeId": "find-max",
    "status": "evaluated",
    "score": 89,
    "breakdown": { "lineIdentification": 40, "explanation": 24, "edgeCase": 20, "fix": 10, "hintPenalty": -5 },
    "feedbackSource": "ai",
    "hintsUsed": 1,
    "durationSec": 184,
    "createdAt": "2026-11-03T10:15:30.123456+00:00"
  }
]
```

`score`, `breakdown` and `feedbackSource` are `null` until the attempt is evaluated (`status: "submitted"`). `durationSec` is whole seconds. Summaries never include the explanation, edge case, fixed code, test results, AI feedback or any hidden challenge field.

## POST /api/users

Request `{ "displayName": "dion" }` (2-32 chars after trimming). Response `201` `{ "id": "uuid", "displayName": "dion" }`. Creates a guest. Unchanged by accounts.

## POST /api/auth/signup

Request:

```json
{ "handle": "dion_m", "email": "dion@example.com", "password": "correct horse battery", "claimUserId": null }
```

Validation:
- `handle` is trimmed and lowercased, then must match `^[a-z0-9_]{3,20}$`. Reserved handles are rejected: `me admin api auth login signup profile u null undefined`.
- `email` is trimmed and lowercased, a valid email address of at most 254 characters.
- `password` is 10 to 72 characters (and at most 72 bytes in UTF-8). It is not trimmed. No composition rules.
- `claimUserId` is optional: a UUID or `null`. It is the guest `userId` stored on this device.

Response `201 Created`:

```json
{
  "session": { "accessToken": "eyJ...", "refreshToken": "v1.abc...", "expiresAt": 1793980800 },
  "user": { "id": "6c1f9a0e-2b3d-4e5f-8a9b-0c1d2e3f4a5b", "handle": "dion_m", "displayName": "dion_m", "memberSince": "2026-11-06T18:00:00.000000+00:00" },
  "claimed": false
}
```

No confirmation email is sent; the account can log in at once.

Claim: when `claimUserId` names a guest row that has no account yet, that row becomes the account (its attempts move with it), `user.id` equals `claimUserId` and `claimed` is `true`. If the row does not exist or already belongs to an account, a new row is created instead, without an error, and `claimed` is `false`; the client can then tell the user that the guest progress stayed on this device as a guest. `claimed` is always present: `false` when no `claimUserId` was sent.

Errors: `400 VALIDATION_ERROR`, `409 HANDLE_TAKEN`, `409 EMAIL_TAKEN`, `429 RATE_LIMITED`, `503 AUTH_UNAVAILABLE`. If the account was created but the automatic login right after it fails, the response is `503 AUTH_UNAVAILABLE`; the account exists and the user can log in.

## POST /api/auth/login

Request `{ "email": "dion@example.com", "password": "correct horse battery" }`. Response `200 OK` `{ session, user }` (no `claimed`; login never claims).

A wrong email or password returns `401 INVALID_CREDENTIALS` with the fixed message `Invalid email or password.` Login is by email only.

## POST /api/auth/refresh

Request `{ "refreshToken": "v1.abc..." }`. Response `200 OK` `{ "session": { "accessToken", "refreshToken", "expiresAt" } }`. The old refresh token is used up; store the new one. An invalid, used or expired refresh token returns `401 UNAUTHORIZED`.

## POST /api/auth/logout

Requires `Authorization: Bearer`. No body. Response `204 No Content`. The server revokes the refresh tokens of this session; the access token stays valid until it expires (at most about 1 h). The client drops its stored session in any case.

## GET /api/me

Requires `Authorization: Bearer`. Response `200 OK`: the account object.

## GET /api/profiles/:handle

Public, no auth. `:handle` is lowercased and must match `^[a-z0-9_]{3,20}$`, otherwise `400 VALIDATION_ERROR`. An unknown handle returns `404 NOT_FOUND` (guests have no handle and no profile).

Response `200 OK`:

```json
{
  "handle": "dion_m",
  "displayName": "dion_m",
  "memberSince": "2026-11-06T18:00:00.000000+00:00",
  "rank": { "name": "Hunter", "xp": 174, "nextName": "Exterminator", "xpToNext": 26 },
  "totalXp": 174,
  "solved": 2,
  "attempted": 3,
  "challengesAvailable": 6,
  "globalPosition": 2,
  "solvedByLanguage": [{ "language": "python", "solved": 2 }],
  "recentSolves": [
    { "challengeId": "find-max", "title": "Largest number in a list", "language": "python", "difficulty": "easy", "bestScore": 89, "solvedAt": "2026-11-06T18:20:00.000000+00:00" }
  ]
}
```

- `totalXp` and `rank` follow `docs/SCORING.md`, "XP and ranks". At the top rank `nextName` is `null` and `xpToNext` is 0.
- `solved` and `attempted` are the same numbers as in `GET /api/progress`. `challengesAvailable` is the number of challenges on the platform.
- `globalPosition`: the account's position on `GET /api/leaderboard` (1 is the top), or `null` when it is not listed (0 XP) or the leaderboard cannot be read right now. It comes from the same 60 s cache as the leaderboard, so it can lag a new solve, and it counts all attempts while `totalXp` here reads the newest 1000.
- `solvedByLanguage`: one entry per language with at least one solved challenge, most solved first, ties by language name.
- `recentSolves`: at most 10 solved challenges, newest `solvedAt` first. `solvedAt` is the `createdAt` of the first attempt that solved it (score at least 70). `bestScore` is the best score on that challenge.
- Never returned: explanations, feedback, weak categories, email or the Supabase user id. Definitions are in `docs/DATA_MODEL.md`, "Derived data for the profile".

## GET /api/leaderboard

Public, no auth. Optional query `limit`: an integer 1-100, default 50. Anything else returns `400 VALIDATION_ERROR`.

Response `200 OK`:

```json
{
  "entries": [
    { "position": 1, "handle": "null_pointer", "totalXp": 274, "rankName": "Exterminator", "solved": 3 },
    { "position": 2, "handle": "dion_m", "totalXp": 174, "rankName": "Hunter", "solved": 2 }
  ],
  "total": 2,
  "updatedAt": "2026-11-12T10:00:00.000Z"
}
```

- Lists accounts with more than 0 XP, at most `limit` entries, best first. Guests are never listed.
- XP follows `docs/SCORING.md`, "XP and ranks", over **all** of the account's attempts. The order and positions follow `docs/SCORING.md`, "Leaderboard". Positions are unique: 1, 2, 3, ... with no shared places.
- `rankName` is the rank name for `totalXp`. `solved` is the number of challenges the account has solved.
- `total` is the number of listed accounts, which can be more than `entries.length`.
- `updatedAt` is when the server computed the ranking. The server caches it for 60 s, so a new solve can take up to a minute to show. The database read times out after 5 s. If a refresh fails, the server keeps serving the last good ranking (its `updatedAt` shows how old it is) and tries again 5 s later. Only when there is no earlier ranking does a failure return `500 INTERNAL_ERROR`.
- Never returned: email, `auth_user_id`, the `users.id` UUID or display names of guests.

## Trust model

Accounts are protected by the Bearer token. For an account, `userId` always comes from the verified token: its raw UUID grants nothing without the token (attempts `404`, progress zeros, history `[]`, evaluation of its attempts `404`). Its public profile shows only the derived data listed under `GET /api/profiles/:handle`.

Guests keep the old rules. Guest ids and attempt ids are random UUIDs, but they are not secrets. Anyone who knows a guest's id can:
- read that guest's progress (`GET /api/progress`) and attempt history (`GET /api/attempts`);
- submit attempts under that id;
- claim that guest's attempts at signup (`claimUserId`), once, as long as the guest row has no account yet.

Anyone who knows the id of a submitted guest attempt can evaluate it. Test results, durations and hint counts come from the browser, also for accounts. Hint order is not enforced on the server either. The platform is for practice use only; nothing here is exam-grade.

Accepted risks:
- `409 EMAIL_TAKEN` tells anyone whether an email is registered.
- Emails are not verified: someone can register with another person's address. No email is ever sent.
- The client stores the session in `localStorage`, so an XSS bug could steal it. AI and student text are never rendered as HTML.

## Rate limits

Limits are per IP address. Over a limit the server returns `429 RATE_LIMITED`. Responses carry the standard `RateLimit` and `RateLimit-Policy` headers (draft-8).

| Limit | Applies to | Per IP |
| --- | --- | --- |
| General | Every request under `/api` | 100 requests per 10 min |
| Signup | `POST /api/auth/signup` | 5 requests per hour, on top of the general limit |
| Login | `POST /api/auth/login` | 10 failed logins (any response with status 400 or higher) per 15 min, on top of the general limit. Successful logins are not counted |
| AI | Requests to `POST /api/challenges/:id/hints` and `POST /api/attempts/:id/evaluation` for which the server calls the LLM | 20 requests that call the LLM per 10 min. One counter shared by both routes, counted on top of the general limit |

The AI limit counts requests, not LLM calls. The evaluation's single retry on invalid output can make a second LLM call within the same request, so one request uses one slot.

The AI limit counts a request only when the server actually calls the LLM for it. It does not count:
- written and demo hints served without an LLM call, including every hint and every evaluation while the AI is not configured or `DEMO_MODE=true`;
- requests that end before any LLM call: `400` validation errors, `404` for an unknown challenge or attempt, `409` already evaluated (except a concurrent evaluation that loses the race after its LLM call, which counts), and the `429` itself.

A hint that falls back to the written hint after the LLM was called (timeout, provider error, rejected output) does count.

While the AI is configured, a request takes one AI slot when it reaches the AI limiter. The slot is given back when the response finishes without an LLM call. So at most 20 such requests can be in flight at once, and a request that already called the LLM stays counted even if the client disconnects. When the AI limit is reached, both routes return `429`.

Order of checks on both AI routes:
1. JSON body parsing (`413`, or `400` for malformed JSON)
2. General limit
3. Path and body validation (`400`)
4. AI limit (`429`)
5. Handler

The client IP is Express's `req.ip`. `trust proxy` is off unless `TRUST_PROXY` is set in `server/.env`. Without it, behind a reverse proxy every client shares the proxy's IP. Set `TRUST_PROXY` to the number of proxies in front of the server (a non-negative integer, e.g. `1`); `req.ip` then becomes the address that many hops back, counting the connecting proxy as the first, so with `1` it is the right-most `X-Forwarded-For` entry. Valid values are 0 to 10. Never set it when clients reach the server directly: they could then write their own IP into `X-Forwarded-For`. Any other value (including `true` or a number above 10) stops the server at startup with a config error naming `TRUST_PROXY`. Never set it higher than the real number of proxies, or a client can choose its own rate-limit key.

## Response headers

Every response (success, error, `404` and CORS preflight) carries:

| Header | Value |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` |
| `Cross-Origin-Resource-Policy` | `same-site` |

The API serves JSON only. CORS allows only `ALLOWED_ORIGIN`. `X-Powered-By` is not sent.

## Timeouts and retries

The POST endpoints are not idempotent. A client that gets no response (timeout, network error, `502`/`503`/`504`) or a `500` cannot tell whether the server stored the request. There are no idempotency keys in the MVP.

- `POST /api/attempts`: the attempt is stored before the response is sent. If the response is lost, the stored attempt stays `submitted`, and its tests and reference solution cannot be fetched again. Retrying stores a second attempt. This is allowed: an unevaluated attempt appears in `GET /api/attempts` with `score: null` and is counted in `perChallenge.attempts` of `GET /api/progress`. When the user has no other attempt on that challenge, it also adds a `perChallenge` entry with `bestScore` 0 and raises `attempted` by one. It does not change `bestScore`, `totalScore`, `solved` or `weakCategories`. Clients should not retry automatically; let the user resubmit.
- `POST /api/attempts/:id/evaluation`: the result is stored with one atomic update, only while the attempt is `submitted`. Repeating the same request is safe. It returns `200` if no evaluation has been stored yet (and stores this one), or `409 ALREADY_EVALUATED` if one has. A `409` means a result is stored. The `409` body is the error envelope only. To recover the stored result, the client reads `GET /api/attempts?userId=&challengeId=` and follows `cursor` and `cursorId` (the `createdAt` and `id` of the last item on the page) until it finds the item whose `id` equals the attempt id, or the list ends: `status`, `score`, `breakdown` and `feedbackSource` are there; AI feedback text is not. `testsPassed` and `testsTotal` can be computed from the client's own test results: a test counts as passed when `passed` is true and `error` is not `'timeout'`. Attempts with `userId: null` cannot be recovered. A repeat that arrives while the first evaluation is still running may call the AI a second time and use a second AI-quota slot, so clients should check `GET /api/attempts` before repeating.
- `POST /api/users`: retrying creates a second user. A user with no attempts has no effect anywhere.
- `POST /api/auth/signup`: not idempotent. A retry after a lost response returns `409 EMAIL_TAKEN`; the client should then send the user to log in.
- `POST /api/auth/refresh`: the refresh token rotates. If the response is lost, the old token may already be used up and the retry gets `401 UNAUTHORIZED`; the user logs in again.

`GET` requests are safe to retry.

## Errors

Shape: `{ "error": { "code": "VALIDATION_ERROR", "message": "Explanation must be at least 20 characters." } }`.

An unavailable AI service is not an error: the evaluation returns `200` with `feedbackSource: "fallback"`.

| HTTP | Code | When |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Invalid, empty or too long input; challenge id not matching `[a-z0-9-]{1,64}`; hint `level` not an integer 1-3; malformed JSON body (also an unsupported charset or encoding); attempt id or `userId` not a UUID; `userId` missing without a token; signup `handle`, `email` or `password` invalid; profile handle not matching `^[a-z0-9_]{3,20}$`; `limit`, `cursor` or `cursorId` invalid, or `cursorId` without `cursor`, on `GET /api/attempts`; `limit` not an integer 1-100 on `GET /api/leaderboard` |
| 401 | UNAUTHORIZED | Missing, malformed, invalid or expired token on a route that needs one, or any bad token sent; invalid refresh token; a token whose user has no account row |
| 401 | INVALID_CREDENTIALS | Login failed. The message is always `Invalid email or password.` |
| 403 | FORBIDDEN | `userId` does not match the token |
| 404 | NOT_FOUND | Challenge, attempt, user or profile does not exist (user: `POST /api/attempts` with an unknown `userId`, or an account's id without its token); unknown route (no router handles the path) |
| 409 | ALREADY_EVALUATED | Attempt already evaluated |
| 409 | HANDLE_TAKEN | Signup with a handle that is already used |
| 409 | EMAIL_TAKEN | Signup with an email that is already registered |
| 413 | PAYLOAD_TOO_LARGE | Body over 50 KB |
| 429 | RATE_LIMITED | Too many requests from this IP (see Rate limits) |
| 500 | INTERNAL_ERROR | Unexpected server error. The message is always the same fixed text, with no details |
| 503 | AUTH_UNAVAILABLE | Supabase Auth timed out (5 s) or is down. Guest play keeps working |
