# BugHunter Arena

Learning platform where students find, explain and fix a deliberate bug in short code challenges. See `CLAUDE.md` and `docs/` for the full description.

## Setup

### LLM settings (`server/.env`)

- `LLM_MODEL` must be a model that actually serves requests. A model being listed for the key is not enough: `gemini-2.5-flash-lite` is listed but returns 404.
- Tested value: `LLM_MODEL=gemini-3.5-flash-lite` with `LLM_API_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`.
- After changing the model, run `npm run eval` in `server/` and check that every case passes. The first recorded run is in `docs/PLAN.md`.
