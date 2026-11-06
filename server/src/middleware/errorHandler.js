import { AppError } from '../lib/AppError.js';
import { logger } from '../lib/logger.js';

const INTERNAL_MESSAGE = 'Something went wrong. Please try again.';

function send(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

/** Path without the query string; never the body. */
function routeOf(req) {
  return (req.originalUrl ?? req.url ?? '').split('?')[0];
}

/** Turns an unmatched request into 404 NOT_FOUND. */
export function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'The requested address does not exist.'));
}

/**
 * Central error handler. Renders the error shape from docs/API.md.
 * A 5xx response always carries a fixed message: no error text, cause or
 * stack reaches the client. The real error is logged without the request body.
 */
// Express recognises error handlers by their four parameters.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError && err.status < 500) {
    return send(res, err.status, err.code, err.message);
  }

  if (err?.type === 'entity.too.large') {
    return send(
      res,
      413,
      'PAYLOAD_TOO_LARGE',
      'Request too large. The maximum size is 50 KB.',
    );
  }

  // Other body-parser errors (broken JSON, unsupported charset or encoding)
  // are client errors. The parser message is not shown.
  if (typeof err?.type === 'string' && err.status >= 400 && err.status < 500) {
    return send(
      res,
      400,
      'VALIDATION_ERROR',
      'The request body is not valid JSON.',
    );
  }

  logger.error(
    { err, method: req.method, route: routeOf(req) },
    'unhandled error',
  );
  return send(res, 500, 'INTERNAL_ERROR', INTERNAL_MESSAGE);
}
