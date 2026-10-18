import { v4 as uuidv4 } from 'uuid';
import { IDatabase, IDatabaseClient } from '../db/index.js';
import { OutboxJob } from '../types/index.js';

export type JobHandler = (eventType: string, payload: any) => Promise<void>;

export class OutboxService {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private customHandlers: Map<string, JobHandler> = new Map();

  constructor(private db: IDatabase) {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers() {
    // Default simulated notifications / webhooks
    this.customHandlers.set('NOTIFY_ASSIGNEE', async (_, payload) => {
      // In production, would send push notification / Slack / email
      if (payload.shouldFail) {
        throw new Error('Simulated transient email gateway timeout');
      }
    });

    this.customHandlers.set('NOTIFY_LEAD_APPROVAL', async (_, payload) => {
      if (payload.shouldFail) {
        throw new Error('Simulated Slack webhook failure');
      }
    });

    this.customHandlers.set('STATUS_CHANGED', async () => {
      // Audit dispatch
    });
  }

  public registerHandler(eventType: string, handler: JobHandler) {
    this.customHandlers.set(eventType, handler);
  }

  /**
   * Enqueues an outbox job INSIDE an existing database transaction client
   */
  async enqueueJob(
    tx: IDatabaseClient,
    eventType: string,
    payload: any,
    maxAttempts = 3
  ): Promise<OutboxJob> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const payloadStr = JSON.stringify(payload);

    await tx.run(
      `INSERT INTO outbox_jobs 
       (id, event_type, payload, status, attempts, max_attempts, next_run_at, created_at)
       VALUES (?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
      [id, eventType, payloadStr, maxAttempts, now, now]
    );

    return {
      id,
      event_type: eventType,
      payload: payloadStr,
      status: 'PENDING',
      attempts: 0,
      max_attempts: maxAttempts,
      last_error: null,
      next_run_at: now,
      created_at: now,
      processed_at: null,
    };
  }

  /**
   * Process batch of pending jobs
   */
  async processPendingJobs(): Promise<{ processed: number; failures: number }> {
    if (this.isProcessing) return { processed: 0, failures: 0 };
    this.isProcessing = true;

    let processed = 0;
    let failures = 0;

    try {
      const now = new Date().toISOString();

      // Retrieve runnable jobs
      const jobs = await this.db.query<OutboxJob>(
        `SELECT * FROM outbox_jobs 
         WHERE status = 'PENDING' AND next_run_at <= ? 
         ORDER BY created_at ASC 
         LIMIT 10`,
        [now]
      );

      for (const job of jobs) {
        // Mark as PROCESSING
        const markRes = await this.db.run(
          `UPDATE outbox_jobs SET status = 'PROCESSING' WHERE id = ? AND status = 'PENDING'`,
          [job.id]
        );

        if (markRes.changes === 0) {
          // Another worker claimed this job
          continue;
        }

        try {
          const payload = JSON.parse(job.payload);
          const handler = this.customHandlers.get(job.event_type);

          if (handler) {
            await handler(job.event_type, payload);
          }

          // Mark completed
          const processedAt = new Date().toISOString();
          await this.db.run(
            `UPDATE outbox_jobs SET status = 'COMPLETED', processed_at = ?, last_error = NULL WHERE id = ?`,
            [processedAt, job.id]
          );
          processed++;
        } catch (err: any) {
          failures++;
          const nextAttempt = job.attempts + 1;
          const errorMessage = err?.message || 'Unknown processing error';

          if (nextAttempt >= job.max_attempts) {
            // Dead letter / mark failed
            await this.db.run(
              `UPDATE outbox_jobs SET status = 'FAILED', attempts = ?, last_error = ? WHERE id = ?`,
              [nextAttempt, errorMessage, job.id]
            );
          } else {
            // Exponential backoff: 2^attempt seconds (e.g. 2s, 4s, 8s)
            const backoffMs = Math.pow(2, nextAttempt) * 1000;
            const nextRunAt = new Date(Date.now() + backoffMs).toISOString();

            await this.db.run(
              `UPDATE outbox_jobs 
               SET status = 'PENDING', attempts = ?, next_run_at = ?, last_error = ? 
               WHERE id = ?`,
              [nextAttempt, nextRunAt, errorMessage, job.id]
            );
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed, failures };
  }

  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const rows = await this.db.query<{ status: string; count: number }>(
      `SELECT status, count(*) as count FROM outbox_jobs GROUP BY status`
    );

    const stats = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    for (const r of rows) {
      const s = r.status.toLowerCase() as keyof typeof stats;
      if (s in stats) {
        stats[s] = Number(r.count);
      }
      stats.total += Number(r.count);
    }
    return stats;
  }

  startWorker(intervalMs = 3000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processPendingJobs().catch(() => {});
    }, intervalMs);
  }

  stopWorker(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
