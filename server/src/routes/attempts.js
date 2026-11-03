import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

// Mounted in app.js at /api/attempts. Owner: M2 worker B (see docs/PLAN.md).
// When building it: apply aiLimiter to the evaluation route.
const router = Router();

// POST /api/attempts
router.post('/', notImplemented);

// POST /api/attempts/:id/evaluation
router.post('/:id/evaluation', notImplemented);

// GET /api/attempts?userId=&challengeId= (Could)
router.get('/', notImplemented);

export default router;
