import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { ProgressQuerySchema } from '../schemas/attempt.js';
import * as attemptService from '../services/attemptService.js';

// Mounted in app.js at /api/progress.
const router = Router();

// GET /api/progress?userId=
router.get('/', validate(ProgressQuerySchema, 'query'), async (req, res) => {
  res.json(await attemptService.getProgress(req.valid.query.userId));
});

export default router;
