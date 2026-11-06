---
paths:
  - "server/**"
---

# Backend rules

## Structure

- `src/routes/` - thin handlers: validate, call a service, shape the response
- `src/services/` - `scoringService`, `aiService`, `fallbackService`, `challengeService`, `attemptService`
- `src/middleware/` - validation, rate limiting, CORS, error handler
- `src/db/` - the only module that talks to Supabase
- `src/prompts/` - `evaluation.md`, `hint.md`, loaded at startup
- `data/challenges/` - challenge JSON, the source of truth; `scripts/seed.js` loads it into the database

## Validation and errors

- Every body and query is validated with a Zod schema before the handler runs.
- Limits: explanation 20-1000 chars, `fixedCode` up to 5000 chars, request body up to 50 KB.
- Errors always use `{ "error": { "code": "...", "message": "..." } }` with the codes in `docs/API.md`. Messages are English and safe to show to users.
- Never put stack traces or internal details in responses.

## AI calls

- `aiService` is the only module that calls the LLM. It exposes `evaluateAnswer(context)` and `getHint(context, level)`, so the provider can be swapped.
- Evaluation: temperature 0-0.2, about 400 output tokens, timeout `AI_TIMEOUT_MS` (15000).
- Hints: temperature 0.3, about 80 output tokens, 8 s timeout, no retry; fall back to the challenge's written hint.
- Parse the response as JSON and validate it with Zod. Clamp `explanation_quality` to 0-10. Retry once on invalid JSON or schema-invalid output, only if at least 1 s of the budget is left; never on timeout or provider error. Then use `fallbackService`.
- Wrap the student's answer in `<student_answer>` tags. Never concatenate it into the instructions.
- With `DEMO_MODE=true`, return the recorded responses in `data/demo-responses.json` without calling the LLM.

## Attempts and scoring

- Attempt status goes `submitted` then `evaluated`. Evaluating an already evaluated attempt returns 409 `ALREADY_EVALUATED`.
- `scoringService` is pure functions with no I/O, covered by Vitest tests for every rule in `docs/SCORING.md`.
- Rate limit per IP: 100 requests per 10 min overall, 20 requests per 10 min that call the LLM, shared by hints and evaluation (a retry inside one request uses no extra slot). Only requests that call the LLM count toward the AI limit.
