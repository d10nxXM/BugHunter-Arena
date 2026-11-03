import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

// Mounted in app.js at /api/challenges/:id/hints. mergeParams exposes the
// challenge id as req.params.id. Owner: M2 worker A (see docs/PLAN.md).
// When building it: validate params and body with Zod, apply aiLimiter.
const router = Router({ mergeParams: true });

// POST /api/challenges/:id/hints
router.post('/', notImplemented);

export default router;
