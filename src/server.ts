import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { IDatabase } from './db/index.js';
import { AuthService } from './services/auth.service.js';
import { ItemService } from './services/item.service.js';
import { CommentService } from './services/comment.service.js';
import { OutboxService } from './services/outbox.service.js';
import { createAuthMiddleware } from './middleware/auth.middleware.js';
import { createIdempotencyMiddleware } from './middleware/idempotency.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { createAuthRoutes } from './routes/auth.routes.js';
import { createItemRoutes } from './routes/items.routes.js';
import { createCommentRoutes } from './routes/comments.routes.js';
import { createTeamRoutes } from './routes/teams.routes.js';
import { createSystemRoutes } from './routes/system.routes.js';

export function createApp(db: IDatabase, outboxService?: OutboxService): Express {
  const app = express();

  // Initialize services
  const actualOutboxService = outboxService || new OutboxService(db);
  const authService = new AuthService(db);
  const itemService = new ItemService(db, actualOutboxService);
  const commentService = new CommentService(db, itemService);

  // Global Middlewares
  app.use(cors());
  app.use(express.json());

  // Idempotency Middleware on all mutating calls
  app.use(createIdempotencyMiddleware(db));

  // Public Routes
  app.use('/api/auth', createAuthRoutes(authService));
  app.use('/api/system', createSystemRoutes(actualOutboxService));

  // Protected Routes requiring Bearer Token
  const authMiddleware = createAuthMiddleware(authService);
  app.use('/api/items', authMiddleware, createItemRoutes(itemService));
  app.use('/api/items', authMiddleware, createCommentRoutes(commentService));
  app.use('/api/teams', authMiddleware, createTeamRoutes(db));

  // Serve static frontend build if present
  const frontendDistPath = path.resolve(process.cwd(), 'frontend', 'dist');
  const indexHtmlPath = path.join(frontendDistPath, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    app.use(express.static(frontendDistPath));
    app.use((req, res, next) => {
      // Only route non-API, non-asset requests to index.html SPA
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
        return res.sendFile(indexHtmlPath);
      }
      next();
    });
  }

  // Central Error Handler
  app.use(errorHandler);

  return app;
}
