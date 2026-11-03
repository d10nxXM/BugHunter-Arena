import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';
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
router.post(
  '/:id/evaluation',
  aiLimiter,
  validate(AttemptIdParamsSchema, 'params'),
  validate(EvaluationSchema),
  async (req, res) => {
    const result = await attemptService.evaluateAttempt(
      req.valid.params.id,
      req.valid.body,
    );
    res.json(result);
  },
);

// GET /api/attempts?userId=&challengeId=
router.get('/', validate(AttemptListQuerySchema, 'query'), async (req, res) => {
  const { userId, challengeId } = req.valid.query;
  res.json(await attemptService.listAttempts(userId, challengeId));
});

export default router;
