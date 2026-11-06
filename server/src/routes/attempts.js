import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { optionalAuth } from '../middleware/auth.js';
import { aiCallRecorder, aiLimiter } from '../middleware/rateLimit.js';
import {
  AttemptIdParamsSchema,
  AttemptListQuerySchema,
  CreateAttemptSchema,
  EvaluationSchema,
} from '../schemas/attempt.js';
import * as attemptService from '../services/attemptService.js';

// Mounted in app.js at /api/attempts. Thin: auth, validate, call the service.
// optionalAuth runs first on every route: a bad token is 401 before
// validation and before any AI quota is used.
const router = Router();

// POST /api/attempts
router.post(
  '/',
  optionalAuth,
  validate(CreateAttemptSchema),
  async (req, res) => {
    const result = await attemptService.createAttempt(req.valid.body, {
      account: req.account,
    });
    res.status(201).json(result);
  },
);

// POST /api/attempts/:id/evaluation
// Validation runs before aiLimiter. Shares the AI counter with hints; only a
// request on which the evaluation actually calls the LLM keeps its slot
// (aiCallRecorder), so 400, 404, 409 and fallback-only runs are given back.
router.post(
  '/:id/evaluation',
  optionalAuth,
  validate(AttemptIdParamsSchema, 'params'),
  validate(EvaluationSchema),
  aiLimiter,
  async (req, res) => {
    const result = await attemptService.evaluateAttempt(
      req.valid.params.id,
      req.valid.body,
      { onAiCall: aiCallRecorder(res), account: req.account },
    );
    res.json(result);
  },
);

// GET /api/attempts?userId=&challengeId=&limit=&cursor=&cursorId=
router.get(
  '/',
  optionalAuth,
  validate(AttemptListQuerySchema, 'query'),
  async (req, res) => {
    const { userId, challengeId, limit, cursor, cursorId } = req.valid.query;
    res.json(
      await attemptService.listAttempts(userId, {
        challengeId,
        limit,
        cursor,
        cursorId,
        account: req.account,
      }),
    );
  },
);

export default router;
