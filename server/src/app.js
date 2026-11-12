import express from 'express';
import cors from 'cors';
import { config } from './lib/config.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import challengesRouter from './routes/challenges.js';
import hintsRouter from './routes/hints.js';
import attemptsRouter from './routes/attempts.js';
import progressRouter from './routes/progress.js';
import usersRouter from './routes/users.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import profilesRouter from './routes/profiles.js';
import leaderboardRouter from './routes/leaderboard.js';

export const app = express();

app.disable('x-powered-by');
// Behind a reverse proxy, TRUST_PROXY (hop count) makes req.ip the client IP
// from X-Forwarded-For, so the per-IP rate limiters see real clients.
if (config.trustProxy !== undefined) app.set('trust proxy', config.trustProxy);
app.use(securityHeaders);
// Liveness check for the hosting platform and uptime pingers. Outside /api on
// purpose: no rate limit (frequent checks must never get 429) and no request log.
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});
app.use(cors({ origin: config.allowedOrigin }));
app.use(requestLogger);
app.use(express.json({ limit: '50kb' }));
app.use('/api', apiLimiter);

app.use('/api/health', healthRouter);
app.use('/api/challenges', challengesRouter);
// Own router so worker A can build hints without editing challenges.js or
// this file. The router uses mergeParams to read :id.
app.use('/api/challenges/:id/hints', hintsRouter);
app.use('/api/attempts', attemptsRouter);
app.use('/api/progress', progressRouter);
app.use('/api/users', usersRouter);
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/leaderboard', leaderboardRouter);

app.use(notFound);
app.use(errorHandler);
