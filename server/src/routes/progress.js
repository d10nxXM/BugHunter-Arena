import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

// Mounted in app.js at /api/progress. Owner: M2 worker B (see docs/PLAN.md).
const router = Router();

// GET /api/progress?userId=
router.get('/', notImplemented);

export default router;
