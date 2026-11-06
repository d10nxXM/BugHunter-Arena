import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { loginLimiter, signupLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { LoginSchema, RefreshSchema, SignupSchema } from '../schemas/auth.js';
import * as authService from '../services/authService.js';

// Mounted in app.js at /api/auth. Thin: limit, validate, call the service.
// Request bodies here hold passwords and tokens: never log them.
const router = Router();

// POST /api/auth/signup
router.post(
  '/signup',
  signupLimiter,
  validate(SignupSchema),
  async (req, res) => {
    res.status(201).json(await authService.signup(req.valid.body));
  },
);

// POST /api/auth/login
router.post('/login', loginLimiter, validate(LoginSchema), async (req, res) => {
  res.json(await authService.login(req.valid.body));
});

// POST /api/auth/refresh
router.post('/refresh', validate(RefreshSchema), async (req, res) => {
  res.json(await authService.refresh(req.valid.body.refreshToken));
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  await authService.logout(req.accessToken);
  res.status(204).end();
});

export default router;
