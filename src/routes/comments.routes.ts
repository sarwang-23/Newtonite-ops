import { Router, Request, Response, NextFunction } from 'express';
import { CommentService } from '../services/comment.service.js';

export function createCommentRoutes(commentService: CommentService): Router {
  const router = Router({ mergeParams: true });

  router.get('/:id/comments', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const itemId = req.params.id as string;
      const comments = await commentService.listComments(user, itemId);
      res.json({ comments });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/comments', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const itemId = req.params.id as string;
      const { content } = req.body;
      const comment = await commentService.addComment(user, itemId, content);
      res.status(201).json(comment);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
