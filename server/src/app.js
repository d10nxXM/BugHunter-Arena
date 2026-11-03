import express from 'express';
import cors from 'cors';
import { config } from './lib/config.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import challengesRouter from './routes/challenges.js';

export const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: config.allowedOrigin }));
app.use(requestLogger);
app.use(express.json({ limit: '50kb' }));
app.use('/api', apiLimiter);

app.use('/api/health', healthRouter);
app.use('/api/challenges', challengesRouter);

app.use(notFound);
app.use(errorHandler);
