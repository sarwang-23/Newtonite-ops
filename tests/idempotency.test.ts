import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { setupTestEnvironment, TestContext } from './helpers.js';

describe('Critical Behavior 3: Repeated Request / Idempotency Key Handling', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await ctx.db.close();
  });

  it('guarantees that identical requests with same Idempotency-Key create only 1 item and return identical response', async () => {
    const idempotencyKey = `idemp-${uuidv4()}`;
    const payload = {
      title: 'Dispute Chargeback from Payment Gateway Idempotent Test',
      description: 'Customer claims merchant did not provide services rendered.',
      type: 'PAYMENT',
      priority: 'HIGH',
      team_id: 'team-pay',
    };

    // First Request
    const res1 = await request(ctx.app)
      .post('/api/items')
      .set('Authorization', `Bearer ${ctx.tokens.payLead}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(201);
    const createdItemId = res1.body.id;
    expect(createdItemId).toBeTruthy();

    // Replay Request (simulating network retry or user double-click)
    const res2 = await request(ctx.app)
      .post('/api/items')
      .set('Authorization', `Bearer ${ctx.tokens.payLead}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.headers['x-idempotency-replay']).toBe('true');
    expect(res2.headers['x-cache-lookup']).toBe('HIT');
    expect(res2.body.id).toBe(createdItemId);
    expect(res2.body.title).toBe(payload.title);

    // Verify only ONE item was inserted into the database
    const dbCount = await ctx.db.get<{ count: number }>(
      'SELECT count(*) as count FROM work_items WHERE title = ?',
      [payload.title]
    );
    expect(Number(dbCount?.count)).toBe(1);
  });
});
