import { Router, Request, Response, NextFunction } from 'express';
import { OutboxService } from '../services/outbox.service.js';

export function createSystemRoutes(outboxService: OutboxService): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response): Promise<void> => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/outbox-stats', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await outboxService.getStats();
      res.json({ stats });
    } catch (err) {
      next(err);
    }
  });

  router.post('/outbox-flush', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await outboxService.processPendingJobs();
      res.json({ success: true, result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
