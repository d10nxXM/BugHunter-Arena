import { logger } from '../lib/logger.js';

/**
 * Logs method, route, status and duration of each request when the response
 * finishes. Never logs bodies, headers or query strings.
 */
export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const route = (req.originalUrl ?? req.url ?? '').split('?')[0];

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info(
      {
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      },
      'request',
    );
  });

  next();
}
