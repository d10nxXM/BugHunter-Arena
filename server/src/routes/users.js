import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

// Mounted in app.js at /api/users. No M2 owner in docs/PLAN.md yet.
const router = Router();

// POST /api/users
router.post('/', notImplemented);

export default router;
