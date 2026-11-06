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
      'supabaseAnonKey',
      'llmApiKey',
      '*.supabaseServiceKey',
      '*.supabaseAnonKey',
      '*.llmApiKey',
      'accessToken',
      'refreshToken',
      'password',
      'email',
      '*.accessToken',
      '*.refreshToken',
      '*.password',
      '*.email',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[redacted]',
  },
});
