---
name: express-patterns
description: Express (ES modules) patterns for BugHunter Arena's server - thin routes, services, Zod validation middleware, central error handler, rate limiting, Supabase data access, timeouts on outbound calls. Use when writing or restructuring code in server/.
---

# Express patterns

## Layout

```
server/src/
├── app.js              # builds and exports the Express app (imported by tests)
├── index.js            # imports app and calls listen
├── routes/             # one router per resource, thin
├── schemas/            # Zod request and response schemas
├── services/           # business logic, no req/res
├── db/                 # Supabase client and queries, snake_case <-> camelCase mapping
├── middleware/         # validate, rateLimit, errorHandler
├── prompts/            # evaluation.md, hint.md
└── lib/                # AppError, logger, config
```

## App setup and middleware order

```js
// server/src/app.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './lib/config.js';
import { apiLimiter, aiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import challenges from './routes/challenges.js';
import attempts from './routes/attempts.js';

export const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.allowedOrigin }));
app.use(express.json({ limit: '50kb' }));
app.use('/api', apiLimiter);

app.use('/api/challenges', challenges);       // hints route inside uses aiLimiter
app.use('/api/attempts', attempts);

app.use(notFound);
app.use(errorHandler);                        // always last
```

```js
// server/src/index.js
import { app } from './app.js';
import { config } from './lib/config.js';

app.listen(config.port, () => console.log(`API on :${config.port}`));
```

Dependencies used here beyond the base install: `npm i cors express-rate-limit pino`.

## Config: validate env once at startup

```js
// server/src/lib/config.js
import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(3000),
  LLM_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  ALLOWED_ORIGIN: z.string().url(),
  AI_TIMEOUT_MS: z.coerce.number().default(15000),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
});

const env = Env.parse(process.env); // crash at startup, not at the first request
export const config = {
  port: env.PORT,
  llmApiKey: env.LLM_API_KEY,
  supabaseUrl: env.SUPABASE_URL,
  supabaseServiceKey: env.SUPABASE_SERVICE_KEY,
  allowedOrigin: env.ALLOWED_ORIGIN,
  aiTimeoutMs: env.AI_TIMEOUT_MS,
  demoMode: env.DEMO_MODE === 'true',
};
```

## Validation middleware

```js
// server/src/middleware/validate.js
import { AppError } from '../lib/AppError.js';

export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const first = result.error.issues[0];
    return next(new AppError(400, 'VALIDATION_ERROR', first?.message ?? 'Neispravan unos.'));
  }
  req.valid = result.data;
  next();
};
```

Handlers read `req.valid`, never `req.body` directly.

## Thin route, logic in a service

```js
// server/src/routes/attempts.js
router.post('/', validate(SubmitAttemptSchema), async (req, res, next) => {
  try {
    const result = await attemptService.submit(req.valid);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
```

Services take plain objects and return plain objects. They never see `req` or `res`, which keeps them unit-testable.

## Errors

```js
// server/src/lib/AppError.js
export class AppError extends Error {
  constructor(status, code, message, options) {
    super(message, options);
    this.status = status;
    this.code = code;
  }
}

// server/src/middleware/errorHandler.js
export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Zahtjev je prevelik.' } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  req.log?.error({ err, route: req.originalUrl }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
}
```

## Outbound calls always time out

```js
export async function completeWithTimeout(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  try {
    return await llmClient.complete({ ...request, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
```

## Data access

- All Supabase calls live in `server/src/db/`. Check `{ data, error }` on every call and throw an `AppError` or a wrapped error, never ignore `error`.
- Select explicit columns. Map snake_case to camelCase before returning.
- No N+1: one grouped query for dashboard stats, not a query per challenge.

## Rate limiting

`express-rate-limit`: `apiLimiter` 100 requests per 10 minutes per IP; `aiLimiter` 20 per 10 minutes on the hints and evaluation routes. Return the 429 error shape from `docs/API.md`.

## Logging

Structured logs (e.g. `pino`) with route, status, duration and attempt id. Never log request bodies, explanations, fixed code or secrets.
