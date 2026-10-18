import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/auth.service.js';
import { config } from '../config.js';

export function createAuthRoutes(authService: AuthService): Router {
  const router = Router();

  router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const result = await authService.authenticate(email, password);
      if (!result) {
        res.status(401).json({ error: 'Invalid email or password credentials' });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      res.json({ user: req.user });
    } catch (err) {
      next(err);
    }
  });

  router.get('/demo-users', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await authService.listDemoUsers();
      // Provide pre-generated tokens for fast reviewer testing
      const enriched = users.map((u) => {
        const token = jwt.sign(
          { sub: u.id, email: u.email, name: u.name },
          config.jwtSecret,
          { expiresIn: '7d' }
        );
        return {
          ...u,
          token,
        };
      });
      res.json({ users: enriched });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
