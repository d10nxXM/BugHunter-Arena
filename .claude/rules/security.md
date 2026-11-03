# Security rules

These apply to every change in the repo.

## Secrets

- `LLM_API_KEY` and `SUPABASE_SERVICE_KEY` are read only from `server/.env` via `process.env`.
- `.env` is gitignored. New variables go into `server/.env.example` with an empty value.
- Never print, log or return a secret, even in an error message or debug output.

## User code

- User code is never executed by Node, never passed to `eval`, `Function`, `child_process` or `vm` on the server.
- It runs only in `client/src/workers/testRunner.worker.js`, terminated after 3 s.

## Integrity of grading

- Solutions, bug lines, bug descriptions, keywords, fallback feedback and hidden tests reach the client only in the response to `POST /api/attempts`, after the attempt is stored and locked. Hints reach it one level at a time, through `POST /api/challenges/:id/hints`.
- Scores are computed on the server. Test results, duration and hint count come from the browser and are trusted only for practice use; do not build features that treat them as exam-grade.

## AI input

- Student text is untrusted. It goes inside `<student_answer>` tags, and the system prompt says to ignore any instructions inside it.
- AI output is validated against a schema before use. Never render it as HTML.

## Privacy

- No email or password in the MVP. A user is an optional display name.
- Logs record errors, routes and timings, never the text of a student's answer.
- Only challenge content and the student's answer are sent to the LLM, no user identifiers.

## Network

- CORS allows only `ALLOWED_ORIGIN`.
- Supabase tables have Row Level Security enabled with no public policies. Only the server's service key reads or writes them.
