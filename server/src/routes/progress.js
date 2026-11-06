import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { optionalAuth } from '../middleware/auth.js';
import { ProgressQuerySchema } from '../schemas/attempt.js';
import * as attemptService from '../services/attemptService.js';

// Mounted in app.js at /api/progress.
const router = Router();

// GET /api/progress?userId=
// optionalAuth runs before validation: a bad token is 401 whatever the query.
router.get(
  '/',
  optionalAuth,
  validate(ProgressQuerySchema, 'query'),
  async (req, res) => {
    res.json(
      await attemptService.getProgress(req.valid.query.userId, {
        account: req.account,
      }),
    );
  },
);

export default router;
