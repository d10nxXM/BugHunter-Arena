import pino from 'pino';
import { config } from './config.js';

/**
 * Structured logger. Log errors, routes and timings only: never request
 * bodies, student answers or secrets.
 */
export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'supabaseServiceKey',
      'llmApiKey',
      '*.supabaseServiceKey',
      '*.llmApiKey',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[redacted]',
  },
});
