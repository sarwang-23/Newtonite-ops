import { Request, Response, NextFunction } from 'express';
import {
  ConflictError,
  ForbiddenError,
  BadRequestError,
  NotFoundError,
} from '../services/item.service.js';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof ConflictError) {
    res.status(409).json({
      error: err.message,
      code: 'CONCURRENCY_CONFLICT',
      latestItem: err.latestItem,
    });
    return;
  }

  if (err instanceof ForbiddenError) {
    res.status(403).json({
      error: err.message,
      code: 'FORBIDDEN',
    });
    return;
  }

  if (err instanceof BadRequestError) {
    res.status(400).json({
      error: err.message,
      code: 'BAD_REQUEST',
    });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({
      error: err.message,
      code: 'NOT_FOUND',
    });
    return;
  }

  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}
