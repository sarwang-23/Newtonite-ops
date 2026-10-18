import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupTestEnvironment, TestContext } from './helpers.js';

describe('Critical Behavior 1: Concurrency Control (Parallel Claims)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await ctx.db.close();
  });

  it('prevents double-claiming: when two team members claim in parallel, exactly one succeeds and the other gets 409 Conflict', async () => {
    // Target item is unassigned: item-unassigned-claim
    const itemId = 'item-unassigned-claim';

    // Verify initial state: assignee is null
    const checkRes = await request(ctx.app)
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.payLead}`);
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.assignee_id).toBeNull();
    const initialVersion = checkRes.body.version;

    // Fire two claims in parallel using Promise.all
    // User 1: Priya Patel (payLead)
    // User 2: Omar Farooq (payOps)
    const [res1, res2] = await Promise.all([
      request(ctx.app)
        .post(`/api/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${ctx.tokens.payLead}`),
      request(ctx.app)
        .post(`/api/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${ctx.tokens.payOps}`),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one 200 OK, and exactly one 409 Conflict
    expect(statuses).toEqual([200, 409]);

    const successRes = res1.status === 200 ? res1 : res2;
    const conflictRes = res1.status === 409 ? res1 : res2;

    expect(successRes.body.assignee_id).toBeTruthy();
    expect(successRes.body.version).toBe(initialVersion + 1);

    expect(conflictRes.body.code).toBe('CONCURRENCY_CONFLICT');
    expect(conflictRes.body.error).toContain('already been claimed');

    // Verify final state in DB has the single winner's ID
    const finalRes = await request(ctx.app)
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.payLead}`);
    expect(finalRes.body.assignee_id).toBe(successRes.body.assignee_id);
    expect(finalRes.body.version).toBe(initialVersion + 1);

    // Verify activity event was recorded in the database
    const activityRes = await request(ctx.app)
      .get(`/api/items/${itemId}/activity`)
      .set('Authorization', `Bearer ${ctx.tokens.payLead}`);
    const claimEvents = activityRes.body.events.filter((e: any) => e.event_type === 'CLAIMED');
    expect(claimEvents.length).toBe(1);
  });
});
