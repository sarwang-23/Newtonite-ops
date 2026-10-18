import { AuthenticatedUser, OutboxStats, Team, WorkItem, ActivityEvent, Comment } from './types';

const TOKEN_KEY = 'newtonite_ops_jwt';
const USER_KEY = 'newtonite_ops_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthenticatedUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function storeAuth(token: string, user: AuthenticatedUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public latestItem?: WorkItem;

  constructor(status: number, message: string, code?: string, latestItem?: WorkItem) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.latestItem = latestItem;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  customToken?: string
): Promise<T> {
  const token = customToken || getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Auto-generate Idempotency-Key for mutating requests if not provided
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(options.method || 'GET')) {
    if (!headers['Idempotency-Key']) {
      headers['Idempotency-Key'] = `web-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error || 'An unexpected server error occurred',
      data.code,
      data.latestItem
    );
  }

  return data as T;
}

export const api = {
  // Auth
  async login(email: string, passwordPlain = 'password123') {
    const res = await request<{ token: string; user: AuthenticatedUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: passwordPlain }),
    });
    storeAuth(res.token, res.user);
    return res;
  },

  async getDemoUsers() {
    return await request<{ users: (AuthenticatedUser & { token: string })[] }>('/api/auth/demo-users');
  },

  async getMe() {
    return await request<{ user: AuthenticatedUser }>('/api/auth/me');
  },

  // Teams
  async getTeams() {
    return await request<{ teams: Team[] }>('/api/teams');
  },

  // Items
  async listItems(params: {
    team_id?: string;
    status?: string;
    priority?: string;
    type?: string;
    assignee_id?: string;
    view?: string;
    q?: string;
    cursor?: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        query.append(k, String(v));
      }
    });
    return await request<{
      items: WorkItem[];
      nextCursor: string | null;
      hasMore: boolean;
    }>(`/api/items?${query.toString()}`);
  },

  async getItem(id: string) {
    return await request<WorkItem>(`/api/items/${id}`);
  },

  async createItem(payload: {
    title: string;
    description: string;
    type: string;
    priority: string;
    team_id: string;
    assignee_id?: string | null;
    due_date?: string | null;
  }, customKey?: string) {
    return await request<WorkItem>('/api/items', {
      method: 'POST',
      headers: customKey ? { 'Idempotency-Key': customKey } : undefined,
      body: JSON.stringify(payload),
    });
  },

  async claimItem(id: string, tokenOverride?: string) {
    return await request<WorkItem>(
      `/api/items/${id}/claim`,
      { method: 'POST' },
      tokenOverride
    );
  },

  async updateItem(id: string, payload: {
    title?: string;
    description?: string;
    priority?: string;
    due_date?: string | null;
    assignee_id?: string | null;
    version: number;
  }) {
    return await request<WorkItem>(`/api/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async transitionItem(id: string, payload: {
    status: string;
    version: number;
    comment?: string;
  }) {
    return await request<WorkItem>(`/api/items/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getActivity(id: string) {
    return await request<{ events: ActivityEvent[] }>(`/api/items/${id}/activity`);
  },

  // Comments
  async listComments(id: string) {
    return await request<{ comments: Comment[] }>(`/api/items/${id}/comments`);
  },

  async addComment(id: string, content: string) {
    return await request<Comment>(`/api/items/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  // System & Outbox
  async getOutboxStats() {
    return await request<{ stats: OutboxStats }>('/api/system/outbox-stats');
  },

  async flushOutbox() {
    return await request<{ success: boolean; result: { processed: number; failures: number } }>(
      '/api/system/outbox-flush',
      { method: 'POST' }
    );
  },
};
