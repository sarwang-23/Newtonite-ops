import { v4 as uuidv4 } from 'uuid';
import { IDatabase, IDatabaseClient } from '../db/index.js';
import { AuthenticatedUser, Comment } from '../types/index.js';
import { RbacService } from './rbac.service.js';
import { ItemService, ForbiddenError, BadRequestError } from './item.service.js';

export class CommentService {
  constructor(
    private db: IDatabase,
    private itemService: ItemService
  ) {}

  async listComments(user: AuthenticatedUser, workItemId: string): Promise<Comment[]> {
    await this.itemService.getItemById(user, workItemId); // verifies team view permission

    return await this.db.query<Comment>(
      `SELECT c.*, u.name as user_name, u.email as user_email
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.work_item_id = ?
       ORDER BY c.created_at ASC`,
      [workItemId]
    );
  }

  async addComment(user: AuthenticatedUser, workItemId: string, content: string): Promise<Comment> {
    const item = await this.itemService.getItemById(user, workItemId);

    if (!RbacService.canMutateTeamItem(user, item.team_id)) {
      throw new ForbiddenError('Access denied: Viewers cannot post comments');
    }

    if (!content || !content.trim()) {
      throw new BadRequestError('Comment content cannot be empty');
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    return await this.db.transaction(async (tx: IDatabaseClient) => {
      await tx.run(
        `INSERT INTO comments (id, work_item_id, user_id, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, workItemId, user.id, content.trim(), now]
      );

      // Record activity event in same transaction
      await tx.run(
        `INSERT INTO activity_events 
         (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
         VALUES (?, ?, ?, 'COMMENT_ADDED', NULL, NULL, ?, ?, ?)`,
        [
          uuidv4(),
          workItemId,
          user.id,
          `Comment added by ${user.name}`,
          JSON.stringify({ snippet: content.slice(0, 80) }),
          now,
        ]
      );

      const comment = await tx.get<Comment>(
        `SELECT c.*, u.name as user_name, u.email as user_email
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.id = ?`,
        [id]
      );

      return comment!;
    });
  }
}
