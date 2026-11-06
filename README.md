# BugHunter Arena

Learning platform where students find, explain and fix a deliberate bug in short code challenges. See `CLAUDE.md` and `docs/` for the full description.

## Setup

### LLM settings (`server/.env`)

- `LLM_MODEL` must be a model that actually serves requests. A model being listed for the key is not enough: `gemini-2.5-flash-lite` is listed but returns 404.
- Tested value: `LLM_MODEL=gemini-3.5-flash-lite` with `LLM_API_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`.
- After changing the model, run `npm run eval` in `server/` and check that every case passes. The first recorded run is in `docs/PLAN.md`.

### Behind a reverse proxy (`server/.env`)

- Set `TRUST_PROXY` to the number of proxies in front of the server (usually `1`) so the per-IP rate limits see real client IPs. Leave it empty when the server is reached directly. Only an integer from 0 to 10 is accepted. See "Rate limits" in `docs/API.md`.

### Client (`client/`)

```bash
cd client
npm install
npm run dev
```

The dev server runs on http://localhost:5173 and proxies `/api` to the Express server on http://localhost:3000, so start `server/` too (`npm run dev` there). To run without a server, set `VITE_USE_MOCKS=true` in `client/.env.local` to answer every call from the mock API. See `client/README.md` for the environment variables, the Pyodide setup and the no-CDN rules.

## Deployment (Render, free tier)

`render.yaml` defines both services: the API (`bughunter-arena-api`, Node web service, health check `/healthz`) and the client (`bughunter-arena`, static site with SPA rewrite and security headers).

1. Push `main` to GitHub.
2. In Render: New > Blueprint, pick this repo, and enter the secret values when asked (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`). They live only in the Render dashboard.
3. If Render gave a service a different URL than the one in `render.yaml`, update `ALLOWED_ORIGIN`, `VITE_API_URL` and the CSP `connect-src`, then redeploy.
4. The free API sleeps after 15 minutes without traffic and takes about a minute to wake. To keep it awake, point a free uptime pinger (e.g. cron-job.org) at `https://<api>/healthz` every 10 minutes.
5. The CSP starts as `Content-Security-Policy-Report-Only`. After a full solve on the live site shows no violations in the browser console, rename it to `Content-Security-Policy`.

