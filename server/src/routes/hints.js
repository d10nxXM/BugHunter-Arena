import { Router } from 'express';
import { z } from 'zod';
import * as challengeService from '../services/challengeService.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { ChallengeIdParamsSchema } from '../schemas/challenge.js';

// Mounted in app.js at /api/challenges/:id/hints. mergeParams exposes the
// challenge id as req.params.id. Written hints only; the level is range
// checked (1-3) but not tied to the number of hints already used.
const router = Router({ mergeParams: true });

// currentAnswer is accepted for forward compatibility and ignored.
const HintRequestSchema = z.object({
  level: z.int().min(1).max(3),
  currentAnswer: z.unknown().optional(),
});

const HintResponseSchema = z.strictObject({
  level: z.int().min(1).max(3),
  hint: z.string().min(1),
  source: z.enum(['written', 'ai']),
});

// POST /api/challenges/:id/hints
router.post(
  '/',
  aiLimiter,
  validate(ChallengeIdParamsSchema, 'params'),
  validate(HintRequestSchema, 'body'),
  async (req, res) => {
    const hint = await challengeService.getWrittenHint(
      req.valid.params.id,
      req.valid.body.level,
    );
    res.json(HintResponseSchema.parse(hint));
  },
);

export default router;
