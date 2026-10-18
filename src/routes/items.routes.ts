import { Router, Request, Response, NextFunction } from 'express';
import { ItemService } from '../services/item.service.js';

export function createItemRoutes(itemService: ItemService): Router {
  const router = Router();

  // List work items with server-side filters & cursor pagination
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const params = {
        team_id: req.query.team_id as string | undefined,
        status: req.query.status as string | undefined,
        priority: req.query.priority as string | undefined,
        type: req.query.type as string | undefined,
        assignee_id: req.query.assignee_id as string | undefined,
        view: req.query.view as any,
        q: req.query.q as string | undefined,
        cursor: req.query.cursor as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      };

      const result = await itemService.listItems(user, params);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Create work item
  router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const item = await itemService.createItem(user, req.body);
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  });

  // Get single work item
  router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const itemId = req.params.id as string;
      const item = await itemService.getItemById(user, itemId);
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  // CRITICAL BEHAVIOR 1: Atomic Concurrent Claim
  router.post('/:id/claim', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const itemId = req.params.id as string;
      const item = await itemService.claimItem(user, itemId);
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  // CRITICAL BEHAVIOR 2: Optimistic Locking Update
  router.patch('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const itemId = req.params.id as string;
      const item = await itemService.updateItem(user, itemId, req.body);
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  // CRITICAL BEHAVIOR 4: Workflow State Transitions with Role Authorization
  router.post('/:id/transition', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const itemId = req.params.id as string;
      const { status, version, comment } = req.body;
      const item = await itemService.transitionStatus(user, itemId, status, version, comment);
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  // Get activity history for work item
  router.get('/:id/activity', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const itemId = req.params.id as string;
      const events = await itemService.getActivityHistory(user, itemId);
      res.json({ events });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
