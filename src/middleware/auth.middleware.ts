import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/auth.service.js';
import { AuthenticatedUser } from '../types/index.js';
import { config } from '../config.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function createAuthMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: Missing or malformed Bearer token' });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { sub: string };
      const user = await authService.getAuthenticatedUser(decoded.sub);

      if (!user) {
        res.status(401).json({ error: 'Unauthorized: User not found or inactive' });
        return;
      }

      req.user = user;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
  };
}
