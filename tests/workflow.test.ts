import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupTestEnvironment, TestContext } from './helpers.js';

describe('Critical Behavior 4: Workflow Rules and Transition Enforcement', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await ctx.db.close();
  });

  it('rejects illegal state jumps that violate the domain workflow state machine', async () => {
    // item-compliance-audit is currently IN_PROGRESS
    const itemId = 'item-compliance-audit';

    const itemRes = await request(ctx.app)
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.compLead}`);
    expect(itemRes.body.status).toBe('IN_PROGRESS');
    const version = itemRes.body.version;

    // IN_PROGRESS cannot jump directly to CLOSED
    const invalidJumpRes = await request(ctx.app)
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${ctx.tokens.compLead}`)
      .send({
        status: 'CLOSED',
        version,
      });

    expect(invalidJumpRes.status).toBe(400);
    expect(invalidJumpRes.body.code).toBe('BAD_REQUEST');
    expect(invalidJumpRes.body.error).toContain('Invalid workflow transition');
  });

  it('enforces that moving from AWAITING_APPROVAL to RESOLVED can ONLY be performed by a Team Lead or Admin', async () => {
    // item-prod-inc-01 is currently AWAITING_APPROVAL in team-eng
    const itemId = 'item-prod-inc-01';

    const itemRes = await request(ctx.app)
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.engDev}`);
    expect(itemRes.body.status).toBe('AWAITING_APPROVAL');
    const version = itemRes.body.version;

    // 1. Regular engineer (MEMBER) attempts to approve the item
    const memberApproveRes = await request(ctx.app)
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${ctx.tokens.engDev}`)
      .send({
        status: 'RESOLVED',
        version,
      });

    // Must be rejected with 403 Forbidden!
    expect(memberApproveRes.status).toBe(403);
    expect(memberApproveRes.body.code).toBe('FORBIDDEN');
    expect(memberApproveRes.body.error).toContain('requires LEAD or ADMIN role');

    // 2. Team Lead attempts to approve the item
    const leadApproveRes = await request(ctx.app)
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${ctx.tokens.engLead}`)
      .send({
        status: 'RESOLVED',
        version,
        comment: 'Fix reviewed and approved in staging.',
      });

    // Lead approval succeeds!
    expect(leadApproveRes.status).toBe(200);
    expect(leadApproveRes.body.status).toBe('RESOLVED');
    expect(leadApproveRes.body.version).toBe(version + 1);

    // Verify activity event was recorded as APPROVED
    const activityRes = await request(ctx.app)
      .get(`/api/items/${itemId}/activity`)
      .set('Authorization', `Bearer ${ctx.tokens.engLead}`);
    const approvedEvents = activityRes.body.events.filter((e: any) => e.event_type === 'APPROVED');
    expect(approvedEvents.length).toBe(1);
  });
});
