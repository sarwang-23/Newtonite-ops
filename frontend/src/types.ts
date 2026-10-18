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

export interface UserMembership {
  team_id: string;
  team_name: string;
  team_slug: string;
  role: Role;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  memberships: UserMembership[];
  token?: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  description: string;
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
  team_name?: string;
  assignee_name?: string | null;
  created_by_name?: string;
}

export interface ActivityEvent {
  id: string;
  work_item_id: string;
  user_id: string | null;
  event_type: string;
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

export interface OutboxStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}
