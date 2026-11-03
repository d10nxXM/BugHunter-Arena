import { Router } from 'express';
import { config } from '../lib/config.js';
import { HealthSchema } from '../schemas/health.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(
    HealthSchema.parse({
      status: 'ok',
      ai: config.aiStatus,
      demoMode: config.demoMode,
    }),
  );
});

export default router;
