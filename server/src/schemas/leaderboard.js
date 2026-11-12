import { z } from 'zod';

/** GET /api/leaderboard?limit= (docs/API.md). Unknown keys are stripped. */
export const LeaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
