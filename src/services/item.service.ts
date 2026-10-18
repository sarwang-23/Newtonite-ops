import { v4 as uuidv4 } from 'uuid';
import { IDatabase, IDatabaseClient } from '../db/index.js';
import {
  ActivityEvent,
  ALLOWED_TRANSITIONS,
  AuthenticatedUser,
  LEAD_REQUIRED_TRANSITIONS,
  WorkItem,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from '../types/index.js';
import { RbacService } from './rbac.service.js';
import { OutboxService } from './outbox.service.js';

export interface WorkItemListParams {
  team_id?: string;
  status?: string;
  priority?: string;
  type?: string;
  assignee_id?: string; // specific user ID, or 'unassigned', or 'me'
  view?: 'assigned_to_me' | 'unassigned_urgent' | 'awaiting_approval' | 'all';
  q?: string;
  cursor?: string; // base64 encoded { created_at, id }
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
}

export class ConflictError extends Error {
  public latestItem: WorkItem;
  constructor(message: string, latestItem: WorkItem) {
    super(message);
    this.name = 'ConflictError';
    this.latestItem = latestItem;
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ItemService {
  constructor(
    private db: IDatabase,
    private outboxService: OutboxService
  ) {}

  /**
   * List work items scoped to user's permitted teams with filters, search and cursor pagination
   */
  async listItems(
    user: AuthenticatedUser,
    params: WorkItemListParams
  ): Promise<PaginatedResult<WorkItem>> {
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const userTeamIds = user.memberships.map((m) => m.team_id);
    const hasGlobalAdmin = user.memberships.some((m) => m.role === 'ADMIN');

    if (userTeamIds.length === 0 && !hasGlobalAdmin) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const conditions: string[] = [];
    const sqlParams: any[] = [];

    // Team filtering with resource isolation
    if (params.team_id) {
      if (!RbacService.canViewTeam(user, params.team_id)) {
        throw new ForbiddenError('Access denied: You do not have permission to view items in this team');
      }
      conditions.push('w.team_id = ?');
      sqlParams.push(params.team_id);
    } else if (!hasGlobalAdmin) {
      // User can only see items from teams they are members of
      const placeholders = userTeamIds.map(() => '?').join(', ');
      conditions.push(`w.team_id IN (${placeholders})`);
      sqlParams.push(...userTeamIds);
    }

    // Preset Quick Views
    if (params.view === 'assigned_to_me') {
      conditions.push('w.assignee_id = ?');
      sqlParams.push(user.id);
    } else if (params.view === 'unassigned_urgent') {
      conditions.push('w.assignee_id IS NULL');
      conditions.push("w.priority IN ('HIGH', 'URGENT')");
      conditions.push("w.status != 'CLOSED'");
    } else if (params.view === 'awaiting_approval') {
      conditions.push("w.status = 'AWAITING_APPROVAL'");
    }

    // Direct filters
    if (params.status) {
      conditions.push('w.status = ?');
      sqlParams.push(params.status);
    }

    if (params.priority) {
      conditions.push('w.priority = ?');
      sqlParams.push(params.priority);
    }

    if (params.type) {
      conditions.push('w.type = ?');
      sqlParams.push(params.type);
    }

    if (params.assignee_id) {
      if (params.assignee_id === 'unassigned') {
        conditions.push('w.assignee_id IS NULL');
      } else if (params.assignee_id === 'me') {
        conditions.push('w.assignee_id = ?');
        sqlParams.push(user.id);
      } else {
        conditions.push('w.assignee_id = ?');
        sqlParams.push(params.assignee_id);
      }
    }

    // Text search (Title or Description)
    if (params.q && params.q.trim()) {
      const searchTerm = `%${params.q.trim()}%`;
      conditions.push('(w.title LIKE ? OR w.description LIKE ?)');
      sqlParams.push(searchTerm, searchTerm);
    }

    // Keyset/Cursor pagination
    if (params.cursor) {
      try {
        const decoded = Buffer.from(params.cursor, 'base64').toString('utf-8');
        const [cursorCreatedAt, cursorId] = decoded.split('|');
        if (cursorCreatedAt && cursorId) {
          conditions.push('(w.created_at < ? OR (w.created_at = ? AND w.id < ?))');
          sqlParams.push(cursorCreatedAt, cursorCreatedAt, cursorId);
        }
      } catch {
        // Invalid cursor ignored
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        w.*,
        t.name as team_name,
        u_assignee.name as assignee_name,
        u_creator.name as created_by_name
      FROM work_items w
      JOIN teams t ON w.team_id = t.id
      LEFT JOIN users u_assignee ON w.assignee_id = u_assignee.id
      LEFT JOIN users u_creator ON w.created_by_id = u_creator.id
      ${whereClause}
      ORDER BY w.created_at DESC, w.id DESC
      LIMIT ?
    `;

    // Fetch limit + 1 to check if there is a next page
    const items = await this.db.query<WorkItem>(sql, [...sqlParams, limit + 1]);

    let nextCursor: string | null = null;
    let hasMore = false;

    if (items.length > limit) {
      hasMore = true;
      const lastItem = items[limit - 1];
      nextCursor = Buffer.from(`${lastItem.created_at}|${lastItem.id}`).toString('base64');
      items.pop(); // remove extra element
    }

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Get work item by ID with team permission verification
   */
  async getItemById(user: AuthenticatedUser, id: string): Promise<WorkItem> {
    const item = await this.db.get<WorkItem>(
      `SELECT 
        w.*,
        t.name as team_name,
        u_assignee.name as assignee_name,
        u_creator.name as created_by_name
       FROM work_items w
       JOIN teams t ON w.team_id = t.id
       LEFT JOIN users u_assignee ON w.assignee_id = u_assignee.id
       LEFT JOIN users u_creator ON w.created_by_id = u_creator.id
       WHERE w.id = ?`,
      [id]
    );

    if (!item) {
      throw new NotFoundError(`Work item ${id} not found`);
    }

    if (!RbacService.canViewTeam(user, item.team_id)) {
      throw new ForbiddenError('Access denied: You do not have permission to view items for this team');
    }

    return item;
  }

  /**
   * Create a new work item with activity event and transactional outbox job
   */
  async createItem(
    user: AuthenticatedUser,
    data: {
      title: string;
      description: string;
      type: WorkItemType;
      priority: WorkItemPriority;
      team_id: string;
      due_date?: string | null;
      assignee_id?: string | null;
    }
  ): Promise<WorkItem> {
    if (!RbacService.canMutateTeamItem(user, data.team_id)) {
      throw new ForbiddenError('Access denied: Viewer role cannot create work items in this team');
    }

    if (!data.title || !data.title.trim()) {
      throw new BadRequestError('Work item title is required');
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const status: WorkItemStatus = 'OPEN';
    const initialVersion = 1;

    return await this.db.transaction(async (tx: IDatabaseClient) => {
      await tx.run(
        `INSERT INTO work_items 
         (id, title, description, type, priority, status, team_id, assignee_id, created_by_id, due_date, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.title.trim(),
          data.description ? data.description.trim() : '',
          data.type,
          data.priority,
          status,
          data.team_id,
          data.assignee_id || null,
          user.id,
          data.due_date || null,
          initialVersion,
          now,
          now,
        ]
      );

      // Record activity event in same transaction
      await tx.run(
        `INSERT INTO activity_events 
         (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
         VALUES (?, ?, ?, 'CREATED', NULL, ?, ?, ?, ?)`,
        [
          uuidv4(),
          id,
          user.id,
          status,
          `Work item created by ${user.name}`,
          JSON.stringify({ priority: data.priority, type: data.type }),
          now,
        ]
      );

      // Enqueue Outbox notification job in same transaction
      await this.outboxService.enqueueJob(tx, 'WORK_ITEM_CREATED', {
        work_item_id: id,
        title: data.title,
        team_id: data.team_id,
        created_by: user.name,
      });

      if (data.assignee_id) {
        await this.outboxService.enqueueJob(tx, 'NOTIFY_ASSIGNEE', {
          work_item_id: id,
          assignee_id: data.assignee_id,
          assigned_by: user.name,
        });
      }

      const created = await tx.get<WorkItem>(
        `SELECT w.*, t.name as team_name, u.name as created_by_name 
         FROM work_items w 
         JOIN teams t ON w.team_id = t.id 
         JOIN users u ON w.created_by_id = u.id 
         WHERE w.id = ?`,
        [id]
      );

      return created!;
    });
  }

  /**
   * CRITICAL BEHAVIOR 1: Concurrent Claim
   * Atomic conditional update ensures only ONE user can claim an unassigned work item.
   * If two users fire simultaneous claims, one gets 200, the other gets 409 Conflict.
   */
  async claimItem(user: AuthenticatedUser, id: string): Promise<WorkItem> {
    const existing = await this.getItemById(user, id);

    if (!RbacService.canMutateTeamItem(user, existing.team_id)) {
      throw new ForbiddenError('Access denied: Viewers cannot claim work items');
    }

    if (existing.assignee_id !== null) {
      throw new ConflictError(
        `Item has already been claimed by ${existing.assignee_name || 'another team member'}`,
        existing
      );
    }

    return await this.db.transaction(async (tx: IDatabaseClient) => {
      const now = new Date().toISOString();

      // Conditional Atomic Update: only updates if assignee_id IS STILL NULL
      const result = await tx.run(
        `UPDATE work_items 
         SET assignee_id = ?, version = version + 1, updated_at = ? 
         WHERE id = ? AND assignee_id IS NULL`,
        [user.id, now, id]
      );

      if (result.changes === 0) {
        // Race condition: another user claimed the item in the exact millisecond!
        const latest = await tx.get<WorkItem>(
          `SELECT w.*, u.name as assignee_name FROM work_items w 
           LEFT JOIN users u ON w.assignee_id = u.id WHERE w.id = ?`,
          [id]
        );
        throw new ConflictError(
          `Conflict: This item was just claimed by ${latest?.assignee_name || 'another user'}`,
          latest!
        );
      }

      // Record activity event in exact same transaction
      await tx.run(
        `INSERT INTO activity_events 
         (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
         VALUES (?, ?, ?, 'CLAIMED', NULL, ?, ?, ?, ?)`,
        [
          uuidv4(),
          id,
          user.id,
          user.id,
          `Item claimed by ${user.name}`,
          JSON.stringify({ previous_assignee: null, new_assignee: user.name }),
          now,
        ]
      );

      // Enqueue notification outbox job
      await this.outboxService.enqueueJob(tx, 'NOTIFY_ASSIGNEE', {
        work_item_id: id,
        assignee_id: user.id,
        action: 'CLAIMED',
      });

      const updated = await tx.get<WorkItem>(
        `SELECT w.*, t.name as team_name, u_assignee.name as assignee_name, u_creator.name as created_by_name
         FROM work_items w
         JOIN teams t ON w.team_id = t.id
         LEFT JOIN users u_assignee ON w.assignee_id = u_assignee.id
         LEFT JOIN users u_creator ON w.created_by_id = u_creator.id
         WHERE w.id = ?`,
        [id]
      );

      return updated!;
    });
  }

  /**
   * CRITICAL BEHAVIOR 2: Optimistic Concurrency Control (OCC)
   * Client sends expected 'version'. Update only WHERE version = ?.
   * If mismatch, throws 409 Conflict with latest item state.
   */
  async updateItem(
    user: AuthenticatedUser,
    id: string,
    updates: {
      title?: string;
      description?: string;
      priority?: WorkItemPriority;
      due_date?: string | null;
      assignee_id?: string | null;
      version: number;
    }
  ): Promise<WorkItem> {
    if (typeof updates.version !== 'number') {
      throw new BadRequestError('Version number is required for optimistic concurrency control');
    }

    const existing = await this.getItemById(user, id);

    if (!RbacService.canMutateTeamItem(user, existing.team_id)) {
      throw new ForbiddenError('Access denied: You do not have edit permissions in this team');
    }

    return await this.db.transaction(async (tx: IDatabaseClient) => {
      const now = new Date().toISOString();
      const newTitle = updates.title !== undefined ? updates.title.trim() : existing.title;
      const newDesc = updates.description !== undefined ? updates.description.trim() : existing.description;
      const newPriority = updates.priority !== undefined ? updates.priority : existing.priority;
      const newDueDate = updates.due_date !== undefined ? updates.due_date : existing.due_date;
      const newAssignee = updates.assignee_id !== undefined ? updates.assignee_id : existing.assignee_id;

      // Optimistic Locking conditional update
      const result = await tx.run(
        `UPDATE work_items 
         SET title = ?, description = ?, priority = ?, due_date = ?, assignee_id = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
        [newTitle, newDesc, newPriority, newDueDate, newAssignee, now, id, updates.version]
      );

      if (result.changes === 0) {
        // Version mismatch detected!
        const latest = await tx.get<WorkItem>(
          `SELECT w.*, t.name as team_name, u_assignee.name as assignee_name, u_creator.name as created_by_name
           FROM work_items w
           JOIN teams t ON w.team_id = t.id
           LEFT JOIN users u_assignee ON w.assignee_id = u_assignee.id
           LEFT JOIN users u_creator ON w.created_by_id = u_creator.id
           WHERE w.id = ?`,
          [id]
        );
        throw new ConflictError(
          `Conflict: This item was modified by another user (expected version ${updates.version}, database version is ${latest?.version}). Reload to reconcile changes.`,
          latest!
        );
      }

      // Check differences for activity logging
      if (newPriority !== existing.priority) {
        await tx.run(
          `INSERT INTO activity_events 
           (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
           VALUES (?, ?, ?, 'PRIORITY_CHANGED', ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            id,
            user.id,
            existing.priority,
            newPriority,
            `Priority changed from ${existing.priority} to ${newPriority}`,
            null,
            now,
          ]
        );
      }

      if (newAssignee !== existing.assignee_id) {
        await tx.run(
          `INSERT INTO activity_events 
           (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
           VALUES (?, ?, ?, 'ASSIGNED', ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            id,
            user.id,
            existing.assignee_id,
            newAssignee,
            `Assignee updated by ${user.name}`,
            null,
            now,
          ]
        );

        if (newAssignee) {
          await this.outboxService.enqueueJob(tx, 'NOTIFY_ASSIGNEE', {
            work_item_id: id,
            assignee_id: newAssignee,
            assigned_by: user.name,
          });
        }
      }

      await tx.run(
        `INSERT INTO activity_events 
         (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
         VALUES (?, ?, ?, 'UPDATED', ?, ?, ?, ?, ?)`,
        [uuidv4(), id, user.id, `v${existing.version}`, `v${existing.version + 1}`, `Work item details updated`, null, now]
      );

      const updated = await tx.get<WorkItem>(
        `SELECT w.*, t.name as team_name, u_assignee.name as assignee_name, u_creator.name as created_by_name
         FROM work_items w
         JOIN teams t ON w.team_id = t.id
         LEFT JOIN users u_assignee ON w.assignee_id = u_assignee.id
         LEFT JOIN users u_creator ON w.created_by_id = u_creator.id
         WHERE w.id = ?`,
        [id]
      );

      return updated!;
    });
  }

  /**
   * CRITICAL BEHAVIOR 4: Workflow State Transitions with Role Checks
   * Validates state machine rules and enforces Lead/Admin approval step.
   */
  async transitionStatus(
    user: AuthenticatedUser,
    id: string,
    targetStatus: WorkItemStatus,
    version: number,
    comment?: string
  ): Promise<WorkItem> {
    if (typeof version !== 'number') {
      throw new BadRequestError('Version is required for workflow state transitions');
    }

    const existing = await this.getItemById(user, id);

    if (!RbacService.canMutateTeamItem(user, existing.team_id)) {
      throw new ForbiddenError('Access denied: You do not have permissions in this team');
    }

    // 1. Validate State Machine Transitions
    const allowedTargets = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowedTargets.includes(targetStatus)) {
      throw new BadRequestError(
        `Invalid workflow transition: Cannot move from ${existing.status} to ${targetStatus}. Allowed transitions: [${allowedTargets.join(', ')}]`
      );
    }

    // 2. Validate Lead / Admin Approval Restriction
    const isApprovalStep = LEAD_REQUIRED_TRANSITIONS.some(
      (rule) => rule.from === existing.status && rule.to === targetStatus
    );

    if (isApprovalStep) {
      const canApprove = RbacService.canApproveInTeam(user, existing.team_id);
      if (!canApprove) {
        throw new ForbiddenError(
          `Forbidden: Transition from ${existing.status} to ${targetStatus} requires LEAD or ADMIN role in this team`
        );
      }
    }

    return await this.db.transaction(async (tx: IDatabaseClient) => {
      const now = new Date().toISOString();

      const result = await tx.run(
        `UPDATE work_items 
         SET status = ?, version = version + 1, updated_at = ? 
         WHERE id = ? AND version = ?`,
        [targetStatus, now, id, version]
      );

      if (result.changes === 0) {
        const latest = await tx.get<WorkItem>(
          `SELECT w.*, t.name as team_name FROM work_items w 
           JOIN teams t ON w.team_id = t.id WHERE w.id = ?`,
          [id]
        );
        throw new ConflictError(
          `Conflict: Status transition rejected because item was modified concurrently. Current version is ${latest?.version}.`,
          latest!
        );
      }

      const eventType = isApprovalStep && targetStatus === 'RESOLVED' ? 'APPROVED' : 'STATUS_CHANGED';
      const eventDesc =
        eventType === 'APPROVED'
          ? `Work item approved and resolved by Lead ${user.name}`
          : `Status changed from ${existing.status} to ${targetStatus} by ${user.name}`;

      await tx.run(
        `INSERT INTO activity_events 
         (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          id,
          user.id,
          eventType,
          existing.status,
          targetStatus,
          eventDesc,
          JSON.stringify({ transition: `${existing.status} -> ${targetStatus}`, comment }),
          now,
        ]
      );

      if (comment && comment.trim()) {
        await tx.run(
          `INSERT INTO comments (id, work_item_id, user_id, content, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), id, user.id, comment.trim(), now]
        );
      }

      // Enqueue Outbox notification
      if (targetStatus === 'AWAITING_APPROVAL') {
        await this.outboxService.enqueueJob(tx, 'NOTIFY_LEAD_APPROVAL', {
          work_item_id: id,
          title: existing.title,
          team_id: existing.team_id,
          requested_by: user.name,
        });
      } else {
        await this.outboxService.enqueueJob(tx, 'STATUS_CHANGED', {
          work_item_id: id,
          old_status: existing.status,
          new_status: targetStatus,
          user_id: user.id,
        });
      }

      const updated = await tx.get<WorkItem>(
        `SELECT w.*, t.name as team_name, u_assignee.name as assignee_name, u_creator.name as created_by_name
         FROM work_items w
         JOIN teams t ON w.team_id = t.id
         LEFT JOIN users u_assignee ON w.assignee_id = u_assignee.id
         LEFT JOIN users u_creator ON w.created_by_id = u_creator.id
         WHERE w.id = ?`,
        [id]
      );

      return updated!;
    });
  }

  /**
   * Get activity history for an item
   */
  async getActivityHistory(user: AuthenticatedUser, itemId: string): Promise<ActivityEvent[]> {
    await this.getItemById(user, itemId); // verifies access

    return await this.db.query<ActivityEvent>(
      `SELECT a.*, u.name as user_name 
       FROM activity_events a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.work_item_id = ?
       ORDER BY a.created_at ASC`,
      [itemId]
    );
  }
}
