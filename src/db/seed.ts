import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { IDatabase, getDatabase } from './index.js';
import { initializeSchema } from './schema.js';
import { WorkItemPriority, WorkItemStatus, WorkItemType } from '../types/index.js';

export async function seedDatabase(db: IDatabase): Promise<void> {
  await initializeSchema(db);

  // Clear existing data for clean re-seeding
  await db.run('DELETE FROM comments');
  await db.run('DELETE FROM activity_events');
  await db.run('DELETE FROM outbox_jobs');
  await db.run('DELETE FROM idempotency_keys');
  await db.run('DELETE FROM work_items');
  await db.run('DELETE FROM memberships');
  await db.run('DELETE FROM teams');
  await db.run('DELETE FROM users');

  const passwordHash = await bcrypt.hash('password123', 10);
  const now = new Date().toISOString();

  // 1. Seed Users
  const users = [
    { id: 'usr-admin', email: 'admin@newtonite.internal', name: 'Alice Admin (Global Admin)' },
    { id: 'usr-eng-lead', email: 'lead.eng@newtonite.internal', name: 'Elena Vance (Eng Lead)' },
    { id: 'usr-eng-dev', email: 'dev.eng@newtonite.internal', name: 'Dave Miller (Eng Member)' },
    { id: 'usr-eng-view', email: 'viewer.eng@newtonite.internal', name: 'Victor Vance (Eng Viewer)' },
    { id: 'usr-pay-lead', email: 'lead.pay@newtonite.internal', name: 'Priya Patel (Payments Lead)' },
    { id: 'usr-pay-ops', email: 'ops.pay@newtonite.internal', name: 'Omar Farooq (Payments Member)' },
    { id: 'usr-comp-lead', email: 'lead.comp@newtonite.internal', name: 'Claire Dupont (Compliance Lead)' },
    { id: 'usr-comp-aud', email: 'auditor.comp@newtonite.internal', name: 'Arthur Dent (Compliance Auditor)' },
    { id: 'usr-ops-lead', email: 'lead.ops@newtonite.internal', name: 'Sarah Jenkins (Ops Lead)' },
    { id: 'usr-ops-agent', email: 'agent.ops@newtonite.internal', name: 'Alex Rivera (Ops Agent)' },
    { id: 'usr-cross-team', email: 'cross.team@newtonite.internal', name: 'Chris Cross (Eng & Ops)' },
  ];

  for (const u of users) {
    await db.run(
      'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      [u.id, u.email, u.name, passwordHash, now]
    );
  }

  // 2. Seed Teams
  const teams = [
    {
      id: 'team-eng',
      name: 'Core Engineering',
      slug: 'engineering',
      description: 'Infrastructure, microservices, reliability, and developer tooling',
    },
    {
      id: 'team-pay',
      name: 'Payments & Risk',
      slug: 'payments',
      description: 'Payment gateway integrations, refunds, ledger reconciliation, and fraud prevention',
    },
    {
      id: 'team-comp',
      name: 'Legal & Compliance',
      slug: 'compliance',
      description: 'Regulatory audits, GDPR/CCPA data export requests, and policy certifications',
    },
    {
      id: 'team-ops',
      name: 'Customer Operations',
      slug: 'operations',
      description: 'Tier-2 escalations, user onboarding bottlenecks, and high-touch VIP support',
    },
  ];

  for (const t of teams) {
    await db.run(
      'INSERT INTO teams (id, name, slug, description, created_at) VALUES (?, ?, ?, ?, ?)',
      [t.id, t.name, t.slug, t.description, now]
    );
  }

  // 3. Seed Memberships (Users -> Teams with Roles)
  const memberships = [
    // Alice Admin is ADMIN in all teams
    { id: 'mem-admin-eng', user_id: 'usr-admin', team_id: 'team-eng', role: 'ADMIN' },
    { id: 'mem-admin-pay', user_id: 'usr-admin', team_id: 'team-pay', role: 'ADMIN' },
    { id: 'mem-admin-comp', user_id: 'usr-admin', team_id: 'team-comp', role: 'ADMIN' },
    { id: 'mem-admin-ops', user_id: 'usr-admin', team_id: 'team-ops', role: 'ADMIN' },

    // Core Engineering
    { id: 'mem-eng-lead', user_id: 'usr-eng-lead', team_id: 'team-eng', role: 'LEAD' },
    { id: 'mem-eng-dev', user_id: 'usr-eng-dev', team_id: 'team-eng', role: 'MEMBER' },
    { id: 'mem-eng-view', user_id: 'usr-eng-view', team_id: 'team-eng', role: 'VIEWER' },

    // Payments & Risk
    { id: 'mem-pay-lead', user_id: 'usr-pay-lead', team_id: 'team-pay', role: 'LEAD' },
    { id: 'mem-pay-ops', user_id: 'usr-pay-ops', team_id: 'team-pay', role: 'MEMBER' },

    // Legal & Compliance
    { id: 'mem-comp-lead', user_id: 'usr-comp-lead', team_id: 'team-comp', role: 'LEAD' },
    { id: 'mem-comp-aud', user_id: 'usr-comp-aud', team_id: 'team-comp', role: 'MEMBER' },

    // Customer Operations
    { id: 'mem-ops-lead', user_id: 'usr-ops-lead', team_id: 'team-ops', role: 'LEAD' },
    { id: 'mem-ops-agent', user_id: 'usr-ops-agent', team_id: 'team-ops', role: 'MEMBER' },

    // Cross-team user
    { id: 'mem-cross-eng', user_id: 'usr-cross-team', team_id: 'team-eng', role: 'MEMBER' },
    { id: 'mem-cross-ops', user_id: 'usr-cross-team', team_id: 'team-ops', role: 'LEAD' },
  ];

  for (const m of memberships) {
    await db.run(
      'INSERT INTO memberships (id, user_id, team_id, role, created_at) VALUES (?, ?, ?, ?, ?)',
      [m.id, m.user_id, m.team_id, m.role, now]
    );
  }

  // 4. Seed Rich Operational Work Items
  const keyWorkItems = [
    {
      id: 'item-prod-inc-01',
      title: 'PostgreSQL Connection Pool Exhaustion in Production Cluster',
      description:
        'DB connection pool reached max capacity (500 connections) during the 14:00 peak billing cycle. API latency spiked to 4.2s. Temporary pool ceiling raised, root cause analysis requires Lead sign-off.',
      type: 'INCIDENT' as WorkItemType,
      priority: 'URGENT' as WorkItemPriority,
      status: 'AWAITING_APPROVAL' as WorkItemStatus,
      team_id: 'team-eng',
      assignee_id: 'usr-eng-dev',
      created_by_id: 'usr-eng-dev',
      due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      version: 3,
    },
    {
      id: 'item-unassigned-claim',
      title: 'Stripe Webhook Signature Verification Failures on Batch Renewals',
      description:
        'Over 140 subscription renewal events dropped due to clock skew or secret rotation mismatch on webhook listener. Requires immediate investigation and retry.',
      type: 'PAYMENT' as WorkItemType,
      priority: 'URGENT' as WorkItemPriority,
      status: 'OPEN' as WorkItemStatus,
      team_id: 'team-pay',
      assignee_id: null, // Unassigned: ideal for concurrent claim test
      created_by_id: 'usr-pay-lead',
      due_date: new Date(Date.now() + 43200000).toISOString().split('T')[0],
      version: 1,
    },
    {
      id: 'item-compliance-audit',
      title: 'GDPR Article 17 Erasure Request for Enterprise Client Acme Corp',
      description:
        'Legal compliance mandate to purge PII records from analytical warehouse and warm backups within statutory 30-day window.',
      type: 'COMPLIANCE' as WorkItemType,
      priority: 'HIGH' as WorkItemPriority,
      status: 'IN_PROGRESS' as WorkItemStatus,
      team_id: 'team-comp',
      assignee_id: 'usr-comp-aud',
      created_by_id: 'usr-comp-lead',
      due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      version: 2,
    },
    {
      id: 'item-customer-chargeback',
      title: 'Dispute Case #88412: High-Volume Duplicate Authorization Claim',
      description:
        'Customer reports 3 concurrent charges of $1,250 on debit account. Merchant acquirer has issued chargeback notice.',
      type: 'CUSTOMER_ISSUE' as WorkItemType,
      priority: 'HIGH' as WorkItemPriority,
      status: 'OPEN' as WorkItemStatus,
      team_id: 'team-pay',
      assignee_id: null,
      created_by_id: 'usr-pay-ops',
      due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      version: 1,
    },
    {
      id: 'item-ops-onboarding',
      title: 'Bulk Provisioning Failure for 500 Enterprise Contractor Seats',
      description:
        'SCIM automated provisioning hook timed out after 30s. 412 user accounts in unverified staging status.',
      type: 'TASK' as WorkItemType,
      priority: 'MEDIUM' as WorkItemPriority,
      status: 'IN_PROGRESS' as WorkItemStatus,
      team_id: 'team-ops',
      assignee_id: 'usr-ops-agent',
      created_by_id: 'usr-ops-lead',
      due_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
      version: 2,
    },
    {
      id: 'item-resolved-bug',
      title: 'Kafka Consumer Lag on Notifications Topic Resolved',
      description:
        'Partitions were rebalanced after broker #4 restart. Consumer lag cleared back to zero.',
      type: 'INCIDENT' as WorkItemType,
      priority: 'LOW' as WorkItemPriority,
      status: 'RESOLVED' as WorkItemStatus,
      team_id: 'team-eng',
      assignee_id: 'usr-eng-dev',
      created_by_id: 'usr-eng-lead',
      due_date: null,
      version: 4,
    },
  ];

  for (const item of keyWorkItems) {
    await db.run(
      `INSERT INTO work_items 
       (id, title, description, type, priority, status, team_id, assignee_id, created_by_id, due_date, version, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.title,
        item.description,
        item.type,
        item.priority,
        item.status,
        item.team_id,
        item.assignee_id,
        item.created_by_id,
        item.due_date,
        item.version,
        now,
        now,
      ]
    );

    // Initial creation activity event
    await db.run(
      `INSERT INTO activity_events 
       (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        item.id,
        item.created_by_id,
        'CREATED',
        null,
        item.status,
        `Created work item with priority ${item.priority}`,
        JSON.stringify({ initial_status: item.status, priority: item.priority }),
        now,
      ]
    );
  }

  // Add specific history events and comments for item-prod-inc-01
  await db.run(
    `INSERT INTO activity_events 
     (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      'item-prod-inc-01',
      'usr-eng-dev',
      'STATUS_CHANGED',
      'OPEN',
      'IN_PROGRESS',
      'Engineer began investigating connection leaks in PgBouncer pool',
      null,
      now,
    ]
  );

  await db.run(
    `INSERT INTO activity_events 
     (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      'item-prod-inc-01',
      'usr-eng-dev',
      'STATUS_CHANGED',
      'IN_PROGRESS',
      'AWAITING_APPROVAL',
      'Submitted patch for connection pool recycling; submitted for Lead approval',
      null,
      now,
    ]
  );

  await db.run(
    `INSERT INTO comments 
     (id, work_item_id, user_id, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      'item-prod-inc-01',
      'usr-eng-dev',
      'Identified a runaway cron worker that was failing to return clients back to the pool on unhandled rejections. Fix deployed to staging.',
      now,
    ]
  );

  // 5. Seed 45 additional realistic items to demonstrate server-side filtering & cursor pagination
  const sampleTitles = [
    'Latency spike on /api/v1/checkout endpoint during flash sale',
    'Investigate 3DS verification drops for Nordic issuers',
    'Quarterly SOC2 Type II evidence collection checklist',
    'Update merchant settlement cutoff window to 23:00 UTC',
    'Add secondary index on orders.customer_id for rapid retrieval',
    'Audit privileged access logs for quarterly compliance review',
    'Support escalation: Client unable to download monthly tax ledger',
    'Deprecate TLS 1.0/1.1 on internal gateway proxies',
    'Review high-value refund request exceeding $5,000 threshold',
    'Fix unhandled exception in transaction status polling cron',
  ];

  const types: WorkItemType[] = ['INCIDENT', 'CUSTOMER_ISSUE', 'PAYMENT', 'COMPLIANCE', 'TASK'];
  const priorities: WorkItemPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const statuses: WorkItemStatus[] = ['OPEN', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED'];
  const teamIds = ['team-eng', 'team-pay', 'team-comp', 'team-ops'];

  for (let i = 1; i <= 45; i++) {
    const id = `item-gen-${i.toString().padStart(3, '0')}`;
    const title = `${sampleTitles[i % sampleTitles.length]} (#${1000 + i})`;
    const type = types[i % types.length];
    const priority = priorities[i % priorities.length];
    const status = statuses[i % statuses.length];
    const team_id = teamIds[i % teamIds.length];
    const assignee_id = i % 3 === 0 ? null : users[i % users.length].id;
    const created_by_id = users[(i + 1) % users.length].id;
    const createdAtDate = new Date(Date.now() - (45 - i) * 3600000).toISOString();

    await db.run(
      `INSERT INTO work_items 
       (id, title, description, type, priority, status, team_id, assignee_id, created_by_id, due_date, version, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        `Automated operational tracking item for ${title}. Logged for triage and resolution.`,
        type,
        priority,
        status,
        team_id,
        assignee_id,
        created_by_id,
        new Date(Date.now() + (i + 1) * 86400000).toISOString().split('T')[0],
        1,
        createdAtDate,
        createdAtDate,
      ]
    );

    await db.run(
      `INSERT INTO activity_events 
       (id, work_item_id, user_id, event_type, old_value, new_value, description, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        id,
        created_by_id,
        'CREATED',
        null,
        status,
        `Work item logged in ${status} state`,
        null,
        createdAtDate,
      ]
    );
  }

  console.log('Database seeded successfully with teams, users, memberships, and realistic work items!');
}

// Direct execution support
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const db = getDatabase();
  seedDatabase(db)
    .then(() => {
      console.log('Seeding complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
