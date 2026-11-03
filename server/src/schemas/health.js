import { z } from 'zod';

/** GET /api/health. Strict, so no config value can slip into the response. */
export const HealthSchema = z.strictObject({
  status: z.literal('ok'),
  ai: z.enum(['available', 'unavailable', 'demo']),
  demoMode: z.boolean(),
});
