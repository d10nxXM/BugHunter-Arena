import { rateLimit } from 'express-rate-limit';
import { AppError } from '../lib/AppError.js';

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * Per-IP rate limiter. Over the limit, passes 429 RATE_LIMITED to the error
 * handler. Each call creates its own counter store.
 *
 * `trust proxy` is off, so behind a reverse proxy every client shares the
 * proxy's IP. Configure it before deploying behind one.
 */
export function createLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
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

/** 20 AI calls per 10 minutes per IP, for the hint and evaluation routes. */
export const aiLimiter = createLimiter({ windowMs: TEN_MINUTES, limit: 20 });
