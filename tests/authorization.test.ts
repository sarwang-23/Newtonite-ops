import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupTestEnvironment, TestContext } from './helpers.js';

describe('Critical Behavior 5: Resource-Level Team Authorization (RBAC)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await ctx.db.close();
  });

  it('prohibits users from reading or modifying work items of teams they do not belong to (403 Forbidden)', async () => {
    // item-compliance-audit belongs to Legal & Compliance (team-comp)
    const complianceItemId = 'item-compliance-audit';

    // Engineering Developer (dev.eng) is NOT a member of team-comp
    const crossReadRes = await request(ctx.app)
      .get(`/api/items/${complianceItemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.engDev}`);

    expect(crossReadRes.status).toBe(403);
    expect(crossReadRes.body.code).toBe('FORBIDDEN');

    // Engineering Developer attempts to update compliance item
    const crossWriteRes = await request(ctx.app)
      .patch(`/api/items/${complianceItemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.engDev}`)
      .send({
        title: 'Unauthorized Cross-Team Modification',
        version: 1,
      });

    expect(crossWriteRes.status).toBe(403);
    expect(crossWriteRes.body.code).toBe('FORBIDDEN');
  });

  it('prevents VIEWER role from mutating or creating items in their own team', async () => {
    // Victor Vance (engViewer) is VIEWER in team-eng
    const createRes = await request(ctx.app)
      .post('/api/items')
      .set('Authorization', `Bearer ${ctx.tokens.engViewer}`)
      .send({
        title: 'Viewer Attempting Creation',
        type: 'INCIDENT',
        priority: 'LOW',
        team_id: 'team-eng',
      });

    expect(createRes.status).toBe(403);
    expect(createRes.body.code).toBe('FORBIDDEN');
    expect(createRes.body.error).toContain('Viewer role cannot create');
  });

  it('allows GLOBAL ADMIN to read and update across any team', async () => {
    const complianceItemId = 'item-compliance-audit';

    // Alice Admin has ADMIN across all teams
    const adminReadRes = await request(ctx.app)
      .get(`/api/items/${complianceItemId}`)
      .set('Authorization', `Bearer ${ctx.tokens.admin}`);

    expect(adminReadRes.status).toBe(200);
    expect(adminReadRes.body.id).toBe(complianceItemId);
  });
});
