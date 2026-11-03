import { Router } from 'express';
import { z } from 'zod';
import * as hintService from '../services/hintService.js';
import { validate } from '../middleware/validate.js';
import { aiCallRecorder, aiLimiter } from '../middleware/rateLimit.js';
import { ChallengeIdParamsSchema } from '../schemas/challenge.js';

// Mounted in app.js at /api/challenges/:id/hints. mergeParams exposes the
// challenge id as req.params.id. The level is range checked (1-3) but not
// tied to the number of hints already used. This is decided behaviour: hint
// order and count are deliberately not enforced on the server (practice use
// only), and each response holds exactly one level. See docs/API.md.
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
  source: z.enum(['written', 'ai', 'demo']),
});

// POST /api/challenges/:id/hints
// aiLimiter shares one counter with the evaluation route (20 LLM calls per
// 10 min). It runs after validation. Only a request on which hintService
// actually calls the LLM keeps its slot (aiCallRecorder); written and demo
// hints, 400 and 404 are given back.
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
      { onAiCall: aiCallRecorder(res) },
    );
    res.json(HintResponseSchema.parse(hint));
  },
);

export default router;
