import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { aiCallRecorder, aiLimiter } from '../middleware/rateLimit.js';
import {
  AttemptIdParamsSchema,
  AttemptListQuerySchema,
  CreateAttemptSchema,
  EvaluationSchema,
} from '../schemas/attempt.js';
import * as attemptService from '../services/attemptService.js';

// Mounted in app.js at /api/attempts. Thin: validate, call the service.
const router = Router();

// POST /api/attempts
router.post('/', validate(CreateAttemptSchema), async (req, res) => {
  const result = await attemptService.createAttempt(req.valid.body);
  res.status(201).json(result);
});

// POST /api/attempts/:id/evaluation
// Validation runs before aiLimiter. Shares the AI counter with hints; only a
// request on which the evaluation actually calls the LLM keeps its slot
// (aiCallRecorder), so 400, 404, 409 and fallback-only runs are given back.
router.post(
  '/:id/evaluation',
  validate(AttemptIdParamsSchema, 'params'),
  validate(EvaluationSchema),
  aiLimiter,
  async (req, res) => {
    const result = await attemptService.evaluateAttempt(
      req.valid.params.id,
      req.valid.body,
      { onAiCall: aiCallRecorder(res) },
    );
    res.json(result);
  },
);

// GET /api/attempts?userId=&challengeId=&limit=&cursor=&cursorId=
router.get('/', validate(AttemptListQuerySchema, 'query'), async (req, res) => {
  const { userId, challengeId, limit, cursor, cursorId } = req.valid.query;
  res.json(
    await attemptService.listAttempts(userId, {
      challengeId,
      limit,
      cursor,
      cursorId,
    }),
  );
});

export default router;
