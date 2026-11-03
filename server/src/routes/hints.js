import { Router } from 'express';
import { z } from 'zod';
import * as hintService from '../services/hintService.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { ChallengeIdParamsSchema } from '../schemas/challenge.js';

// Mounted in app.js at /api/challenges/:id/hints. mergeParams exposes the
// challenge id as req.params.id. The level is range checked (1-3) but not
// tied to the number of hints already used.
const router = Router({ mergeParams: true });

// The student's work in progress; shaped and capped because the AI may read it.
const CurrentAnswerSchema = z.object({
  selectedLines: z.array(z.int().positive()).max(10).optional(),
  explanation: z.string().max(1000).optional(),
});

const HintRequestSchema = z.object({
  level: z.int().min(1).max(3),
  currentAnswer: CurrentAnswerSchema.optional(),
});

const HintResponseSchema = z.strictObject({
  level: z.int().min(1).max(3),
  hint: z.string().min(1),
  source: z.enum(['written', 'ai']),
});

// POST /api/challenges/:id/hints
// aiLimiter shares one counter with the evaluation route (20 per 10 min). It
// runs after validation, so malformed requests do not use up AI calls.
router.post(
  '/',
  validate(ChallengeIdParamsSchema, 'params'),
  validate(HintRequestSchema, 'body'),
  aiLimiter,
  async (req, res) => {
    const hint = await hintService.getHint(
      req.valid.params.id,
      req.valid.body.level,
      req.valid.body.currentAnswer,
    );
    res.json(HintResponseSchema.parse(hint));
  },
);

export default router;
