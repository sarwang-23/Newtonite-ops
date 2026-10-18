import { IDatabase } from './index.js';

export async function initializeSchema(db: IDatabase): Promise<void> {
  const ddl = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      team_id TEXT NOT NULL REFERENCES teams(id),
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id),
      assignee_id TEXT REFERENCES users(id),
      created_by_id TEXT NOT NULL REFERENCES users(id),
      due_date TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      event_type TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      description TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      path TEXT NOT NULL,
      method TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbox_jobs (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      next_run_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      processed_at TEXT
    );

    -- Performance and concurrency indexes
    CREATE INDEX IF NOT EXISTS idx_work_items_team_status ON work_items(team_id, status);
    CREATE INDEX IF NOT EXISTS idx_work_items_assignee ON work_items(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority);
    CREATE INDEX IF NOT EXISTS idx_work_items_created_at ON work_items(created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_events_item ON activity_events(work_item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(work_item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_jobs_poll ON outbox_jobs(status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys(expires_at);
  `;

  // SQLite and Postgres both execute multiple statements or line-by-line
  const statements = ddl
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await db.run(stmt);
  }
}
