import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { publicUser } from '../services/authService.js';

// Mounted in app.js at /api/me.
const router = Router();

// GET /api/me
router.get('/', requireAuth, (req, res) => {
  res.json(publicUser(req.account));
});

export default router;
