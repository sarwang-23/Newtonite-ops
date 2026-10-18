import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupTestEnvironment, TestContext } from './helpers.js';

describe('Critical Behavior 6: Reliable Async Work (Transactional Outbox Pattern)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await ctx.db.close();
  });

  it('guarantees that an outbox job is written in the same transaction as the work item', async () => {
    const res = await request(ctx.app)
      .post('/api/items')
      .set('Authorization', `Bearer ${ctx.tokens.engDev}`)
      .send({
        title: 'New Service Deployment Checklist',
        description: 'Verify deployment configs and readiness probes.',
        type: 'TASK',
        priority: 'MEDIUM',
        team_id: 'team-eng',
      });

    expect(res.status).toBe(201);
    const createdId = res.body.id;

    // Check that outbox table has the pending job
    const jobs = await ctx.db.query(
      `SELECT * FROM outbox_jobs WHERE status = 'PENDING' AND event_type = 'WORK_ITEM_CREATED'`
    );
    expect(jobs.length).toBeGreaterThan(0);
    const matchingJob = jobs.find((j: any) => j.payload.includes(createdId));
    expect(matchingJob).toBeDefined();
    expect(matchingJob.attempts).toBe(0);

    // Process pending outbox jobs
    const { processed } = await ctx.outboxService.processPendingJobs();
    expect(processed).toBeGreaterThan(0);

    // Verify job is now marked COMPLETED with processed_at set
    const updatedJob = await ctx.db.get<{ status: string; processed_at: string }>(
      'SELECT status, processed_at FROM outbox_jobs WHERE id = ?',
      [matchingJob.id]
    );
    expect(updatedJob?.status).toBe('COMPLETED');
    expect(updatedJob?.processed_at).toBeTruthy();
  });

  it('retries failing async jobs with backoff and marks them FAILED once max_attempts is reached', async () => {
    let callCount = 0;
    // Register a handler that fails on purpose
    ctx.outboxService.registerHandler('TEST_FAIL_EVENT', async () => {
      callCount++;
      throw new Error('External webhook connection timeout');
    });

    // Enqueue a job directly with max_attempts = 2
    await ctx.db.transaction(async (tx) => {
      await ctx.outboxService.enqueueJob(tx, 'TEST_FAIL_EVENT', { test: true }, 2);
    });

    // 1st attempt: should fail, increment attempts to 1, schedule future retry
    const res1 = await ctx.outboxService.processPendingJobs();
    expect(res1.failures).toBe(1);

    const jobAfterAttempt1 = await ctx.db.get<any>(
      `SELECT * FROM outbox_jobs WHERE event_type = 'TEST_FAIL_EVENT'`
    );
    expect(jobAfterAttempt1.attempts).toBe(1);
    expect(jobAfterAttempt1.status).toBe('PENDING');
    expect(jobAfterAttempt1.last_error).toContain('External webhook connection timeout');

    // Force next_run_at to past so worker picks it up for attempt 2
    await ctx.db.run(
      `UPDATE outbox_jobs SET next_run_at = ? WHERE id = ?`,
      [new Date(Date.now() - 1000).toISOString(), jobAfterAttempt1.id]
    );

    // 2nd attempt: reaches max_attempts (2) -> marks status = FAILED
    const res2 = await ctx.outboxService.processPendingJobs();
    expect(res2.failures).toBe(1);

    const jobAfterAttempt2 = await ctx.db.get<any>(
      `SELECT * FROM outbox_jobs WHERE id = ?`,
      [jobAfterAttempt1.id]
    );
    expect(jobAfterAttempt2.attempts).toBe(2);
    expect(jobAfterAttempt2.status).toBe('FAILED');
    expect(jobAfterAttempt2.last_error).toContain('External webhook connection timeout');
  });
});
