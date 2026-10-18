import { Router, Request, Response, NextFunction } from 'express';
import { IDatabase } from '../db/index.js';
import { Team } from '../types/index.js';

export function createTeamRoutes(db: IDatabase): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teams = await db.query<Team>('SELECT * FROM teams ORDER BY name ASC');
      res.json({ teams });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
