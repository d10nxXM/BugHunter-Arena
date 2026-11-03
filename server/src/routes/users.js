import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { CreateUserSchema } from '../schemas/attempt.js';
import { createUser } from '../db/users.js';

// Mounted in app.js at /api/users.
const router = Router();

// POST /api/users
router.post('/', validate(CreateUserSchema), async (req, res) => {
  const user = await createUser(req.valid.body.displayName);
  res.status(201).json(user);
});

export default router;
