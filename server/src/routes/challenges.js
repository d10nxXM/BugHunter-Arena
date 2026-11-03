import { Router } from 'express';
import * as challengeService from '../services/challengeService.js';
import { validate } from '../middleware/validate.js';
import {
  ChallengeIdParamsSchema,
  ChallengeListSchema,
  ChallengePublicSchema,
} from '../schemas/challenge.js';

const router = Router();

// Responses are parsed with strict schemas: an unexpected field throws and
// becomes a 500, so hidden data can never reach the browser silently.

router.get('/', async (_req, res) => {
  const challenges = await challengeService.listPublic();
  res.json(ChallengeListSchema.parse(challenges));
});

router.get(
  '/:id',
  validate(ChallengeIdParamsSchema, 'params'),
  async (req, res) => {
    const challenge = await challengeService.getPublic(req.valid.params.id);
    res.json(ChallengePublicSchema.parse(challenge));
  },
);

export default router;
