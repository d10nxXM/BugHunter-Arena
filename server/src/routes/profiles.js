import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { ProfileParamsSchema } from '../schemas/auth.js';
import { getProfile } from '../services/profileService.js';

// Mounted in app.js at /api/profiles. Public, read-only.
const router = Router();

// GET /api/profiles/:handle
router.get(
  '/:handle',
  validate(ProfileParamsSchema, 'params'),
  async (req, res) => {
    res.json(await getProfile(req.valid.params.handle));
  },
);

export default router;
