import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupTestEnvironment, TestContext } from './helpers.js';

describe('Critical Behavior 2: Stale Update Handling (Optimistic Concurrency Control)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await ctx.db.close();
  });

  it('rejects stale edits with 409 Conflict when client sends an outdated version number', async () => {
    const itemId = 'item-prod-inc-01';

    // 1. Fetch current item version
    const itemRes = await request(ctx.app)
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.engDev}`);
    expect(itemRes.status).toBe(200);
    const currentVersion = itemRes.body.version;

    // 2. User A successfully updates the title with the current version
    const updateResA = await request(ctx.app)
      .patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.engDev}`)
      .send({
        title: 'Updated Title by Engineer A',
        version: currentVersion,
      });
    expect(updateResA.status).toBe(200);
    expect(updateResA.body.version).toBe(currentVersion + 1);
    expect(updateResA.body.title).toBe('Updated Title by Engineer A');

    // 3. User B tries to update using the stale version (currentVersion)
    const updateResB = await request(ctx.app)
      .patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.engLead}`)
      .send({
        title: 'Conflicting Title by Lead B',
        version: currentVersion, // Stale!
      });

    // 4. Server rejects with 409 Conflict
    expect(updateResB.status).toBe(409);
    expect(updateResB.body.code).toBe('CONCURRENCY_CONFLICT');
    expect(updateResB.body.latestItem.version).toBe(currentVersion + 1);
    expect(updateResB.body.latestItem.title).toBe('Updated Title by Engineer A');

    // 5. Verify database remained unchanged by the failed stale update
    const verifyRes = await request(ctx.app)
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.engDev}`);
    expect(verifyRes.body.title).toBe('Updated Title by Engineer A');
    expect(verifyRes.body.version).toBe(currentVersion + 1);
  });
});
