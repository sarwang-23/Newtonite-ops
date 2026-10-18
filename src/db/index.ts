import Database from 'better-sqlite3';
import { Pool, PoolClient } from 'pg';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

export interface RunResult {
  changes: number;
}

export interface IDatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  run(sql: string, params?: any[]): Promise<RunResult>;
}

export interface IDatabase extends IDatabaseClient {
  transaction<T>(fn: (tx: IDatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isPostgres(): boolean;
}

// SQLite Adapter implementation
class SQLiteAdapter implements IDatabase {
  private db: Database.Database;

  constructor(filePath?: string) {
    if (!filePath || filePath === ':memory:') {
      this.db = new Database(':memory:');
    } else {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.db = new Database(filePath);
    }

    // Enable WAL mode for high concurrency
    if (filePath !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
    }
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);
    return (row as T) || null;
  }

  async run(sql: string, params: any[] = []): Promise<RunResult> {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...params);
    return { changes: info.changes };
  }

  async transaction<T>(fn: (tx: IDatabaseClient) => Promise<T>): Promise<T> {
    // In SQLite, start IMMEDIATE transaction to prevent deadlocks under concurrent write races
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback errors if already rolled back
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }

  isPostgres(): boolean {
    return false;
  }
}

// PostgreSQL Adapter implementation
class PostgresAdapter implements IDatabase {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  private convertPlaceholders(sql: string): string {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const pgSql = this.convertPlaceholders(sql);
    const res = await this.pool.query(pgSql, params);
    return res.rows as T[];
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const pgSql = this.convertPlaceholders(sql);
    const res = await this.pool.query(pgSql, params);
    return (res.rows[0] as T) || null;
  }

  async run(sql: string, params: any[] = []): Promise<RunResult> {
    const pgSql = this.convertPlaceholders(sql);
    const res = await this.pool.query(pgSql, params);
    return { changes: res.rowCount ?? 0 };
  }

  async transaction<T>(fn: (tx: IDatabaseClient) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txClient: IDatabaseClient = {
        query: async <R = any>(sql: string, params: any[] = []): Promise<R[]> => {
          let idx = 1;
          const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
          const res = await client.query(pgSql, params);
          return res.rows as R[];
        },
        get: async <R = any>(sql: string, params: any[] = []): Promise<R | null> => {
          let idx = 1;
          const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
          const res = await client.query(pgSql, params);
          return (res.rows[0] as R) || null;
        },
        run: async (sql: string, params: any[] = []): Promise<RunResult> => {
          let idx = 1;
          const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
          const res = await client.query(pgSql, params);
          return { changes: res.rowCount ?? 0 };
        },
      };

      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  isPostgres(): boolean {
    return true;
  }
}

// Singleton database instance
let databaseInstance: IDatabase | null = null;

export function getDatabase(customPathOrUrl?: string): IDatabase {
  if (databaseInstance && !customPathOrUrl) {
    return databaseInstance;
  }

  const target = customPathOrUrl || config.databaseUrl;

  if (target && (target.startsWith('postgres://') || target.startsWith('postgresql://'))) {
    const db = new PostgresAdapter(target);
    if (!customPathOrUrl) databaseInstance = db;
    return db;
  }

  // SQLite fallback
  const dbFile = target || path.resolve(process.cwd(), 'data', 'newtonite_ops.db');
  const db = new SQLiteAdapter(dbFile);
  if (!customPathOrUrl) databaseInstance = db;
  return db;
}

export function createInMemoryDatabase(): IDatabase {
  return new SQLiteAdapter(':memory:');
}
