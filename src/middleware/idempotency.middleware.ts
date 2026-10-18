import { Request, Response, NextFunction } from 'express';
import { IDatabase } from '../db/index.js';
import { IdempotencyRecord } from '../types/index.js';

export function createIdempotencyMiddleware(db: IDatabase) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only apply idempotency to mutating HTTP requests
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = (req.headers['idempotency-key'] ||
      req.headers['x-idempotency-key']) as string | undefined;

    if (!idempotencyKey || !idempotencyKey.trim()) {
      return next();
    }

    const key = idempotencyKey.trim();
    const userId = req.user ? req.user.id : 'anonymous';

    try {
      // 1. Check if response is already cached
      const existing = await db.get<IdempotencyRecord>(
        `SELECT * FROM idempotency_keys WHERE key = ? AND user_id = ?`,
        [key, userId]
      );

      if (existing) {
        const now = new Date().toISOString();
        if (existing.expires_at > now) {
          res.setHeader('X-Cache-Lookup', 'HIT');
          res.setHeader('X-Idempotency-Replay', 'true');
          const parsed = JSON.parse(existing.response_body);
          res.status(existing.status_code).json(parsed);
          return;
        } else {
          // expired key, delete it
          await db.run('DELETE FROM idempotency_keys WHERE key = ?', [key]);
        }
      }

      // 2. Intercept response to cache it on successful execution
      const originalJson = res.json.bind(res);
      res.json = (body: any): Response => {
        // Only cache 2xx or 4xx deterministic client responses, avoid caching 5xx internal server errors
        if (res.statusCode < 500) {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours expiry
          const bodyStr = JSON.stringify(body);

          db.run(
            `INSERT INTO idempotency_keys 
             (key, user_id, path, method, status_code, response_body, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (key) DO UPDATE SET
               user_id = excluded.user_id,
               status_code = excluded.status_code,
               response_body = excluded.response_body,
               expires_at = excluded.expires_at`,
            [key, userId, req.originalUrl, req.method, res.statusCode, bodyStr, now.toISOString(), expiresAt]
          ).catch((err) => {
            console.error('Failed to store idempotency record:', err);
          });
        }

        return originalJson(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
