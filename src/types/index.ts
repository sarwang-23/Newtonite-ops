export type Role = 'VIEWER' | 'MEMBER' | 'LEAD' | 'ADMIN';

export type WorkItemType =
  | 'INCIDENT'
  | 'CUSTOMER_ISSUE'
  | 'PAYMENT'
  | 'COMPLIANCE'
  | 'TASK';

export type WorkItemPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type WorkItemStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'AWAITING_APPROVAL'
  | 'RESOLVED'
  | 'CLOSED';

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
}

export interface TeamMembership {
  id: string;
  user_id: string;
  team_id: string;
  role: Role;
  created_at: string;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  type: WorkItemType;
  priority: WorkItemPriority;
  status: WorkItemStatus;
  team_id: string;
  assignee_id: string | null;
  created_by_id: string;
  due_date: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  
  // Joined fields
  team_name?: string;
  assignee_name?: string | null;
  created_by_name?: string;
}

export type ActivityEventType =
  | 'CREATED'
  | 'ASSIGNED'
  | 'CLAIMED'
  | 'UNASSIGNED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'UPDATED'
  | 'COMMENT_ADDED'
  | 'APPROVED';

export interface ActivityEvent {
  id: string;
  work_item_id: string;
  user_id: string | null;
  event_type: ActivityEventType;
  old_value: string | null;
  new_value: string | null;
  description: string;
  metadata: string | null;
  created_at: string;
  user_name?: string | null;
}

export interface Comment {
  id: string;
  work_item_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

export interface IdempotencyRecord {
  key: string;
  user_id: string;
  path: string;
  method: string;
  status_code: number;
  response_body: string;
  created_at: string;
  expires_at: string;
}

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface OutboxJob {
  id: string;
  event_type: string;
  payload: string; // JSON string
  status: OutboxStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_run_at: string;
  created_at: string;
  processed_at: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  memberships: {
    team_id: string;
    team_name: string;
    team_slug: string;
    role: Role;
  }[];
}

// Allowed state transitions map
export const ALLOWED_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  OPEN: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['AWAITING_APPROVAL', 'RESOLVED', 'OPEN'],
  AWAITING_APPROVAL: ['RESOLVED', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['OPEN'],
};

// Transitions that require LEAD or ADMIN permission in that team
export const LEAD_REQUIRED_TRANSITIONS: { from: WorkItemStatus; to: WorkItemStatus }[] = [
  { from: 'AWAITING_APPROVAL', to: 'RESOLVED' },
  { from: 'AWAITING_APPROVAL', to: 'IN_PROGRESS' }, // Rejection
];
