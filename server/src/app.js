import express from 'express';
import cors from 'cors';
import { config } from './lib/config.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import challengesRouter from './routes/challenges.js';
import hintsRouter from './routes/hints.js';
import attemptsRouter from './routes/attempts.js';
import progressRouter from './routes/progress.js';
import usersRouter from './routes/users.js';

export const app = express();

app.disable('x-powered-by');
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

app.use(notFound);
app.use(errorHandler);
