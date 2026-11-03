import { rateLimit } from 'express-rate-limit';
import { AppError } from '../lib/AppError.js';
import { config } from '../lib/config.js';

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * Per-IP rate limiter. Over the limit, passes 429 RATE_LIMITED to the error
 * handler. Each call creates its own counter store. Extra express-rate-limit
 * options are spread before `handler`, so the error shape cannot be replaced.
 *
 * `trust proxy` is off, so behind a reverse proxy every client shares the
 * proxy's IP. Configure it before deploying behind one.
 */
export function createLimiter({ windowMs, limit, ...options }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...options,
    handler: (_req, _res, next) => {
      next(
        new AppError(
          429,
          'RATE_LIMITED',
          'Previše zahtjeva. Sačekaj malo pa pokušaj ponovo.',
        ),
      );
    },
  });
}

/** 100 requests per 10 minutes per IP, mounted on /api. */
export const apiLimiter = createLimiter({ windowMs: TEN_MINUTES, limit: 100 });

/**
 * AI quota: `limit` LLM calls per 10 minutes per IP, one counter shared by
 * POST /api/challenges/:id/hints and POST /api/attempts/:id/evaluation.
 *
 * Reserve and release: while the AI is configured (aiStatus 'available'),
 * every request reserves a slot before the handler runs, so the 429 is
 * decided before any LLM call. When the response finishes, the slot is given
 * back unless the handler marked an LLM call with aiCallRecorder (written or
 * demo hints, 400/404/409 and the 429 itself are refunded this way).
 *
 * Only `finish` refunds. A connection that closes without a finished response
 * keeps its slot: refunding on `close` (skipFailedRequests) would let a client
 * disconnect after the LLM call and get the slot back. Demo mode and an
 * unconfigured AI skip the limiter entirely.
 *
 * One slot covers one request that calls the LLM, not one LLM call: the
 * evaluation's single retry on invalid output makes a second call inside the
 * same request, so the worst case is 2 LLM calls per slot (40 per window).
 *
 * Slots are reserved while a request is in flight. While the AI is
 * configured, up to `limit` slow requests in flight from one IP (e.g. LLM
 * calls waiting on AI_TIMEOUT_MS) hold every slot, so that same IP's other
 * hint and evaluation requests get 429 until some of them finish.
 */
export function createAiLimiter({ limit = 20 } = {}) {
  return createLimiter({
    windowMs: TEN_MINUTES,
    limit,
    skip: () => config.aiStatus !== 'available',
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.locals.aiCalled !== true,
  });
}

export const aiLimiter = createAiLimiter();

/**
 * Callback for a service to invoke right before it calls the LLM; marks the
 * response so aiLimiter keeps the reserved slot.
 */
export function aiCallRecorder(res) {
  return () => {
    res.locals.aiCalled = true;
  };
}
