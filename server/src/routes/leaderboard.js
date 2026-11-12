import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { LeaderboardQuerySchema } from '../schemas/leaderboard.js';
import { getLeaderboard } from '../services/leaderboardService.js';

// Mounted in app.js at /api/leaderboard. Public, read-only.
const router = Router();

// GET /api/leaderboard?limit=
router.get('/', validate(LeaderboardQuerySchema, 'query'), async (req, res) => {
  res.json(await getLeaderboard(req.valid.query.limit));
});

export default router;
