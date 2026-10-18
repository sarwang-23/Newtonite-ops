import request from 'supertest';
import { createInMemoryDatabase, IDatabase } from '../src/db/index.js';
import { initializeSchema } from '../src/db/schema.js';
import { seedDatabase } from '../src/db/seed.js';
import { createApp } from '../src/server.js';
import { OutboxService } from '../src/services/outbox.service.js';
import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';

export interface TestContext {
  db: IDatabase;
  app: any;
  outboxService: OutboxService;
  tokens: {
    admin: string;
    engLead: string;
    engDev: string;
    engViewer: string;
    payLead: string;
    payOps: string;
    compLead: string;
    compAuditor: string;
    opsLead: string;
    opsAgent: string;
    crossTeam: string;
  };
}

export async function setupTestEnvironment(): Promise<TestContext> {
  const db = createInMemoryDatabase();
  await initializeSchema(db);
  await seedDatabase(db);

  const outboxService = new OutboxService(db);
  const app = createApp(db, outboxService);

  const createToken = (userId: string, email: string, name: string) =>
    jwt.sign({ sub: userId, email, name }, config.jwtSecret, { expiresIn: '1h' });

  const tokens = {
    admin: createToken('usr-admin', 'admin@newtonite.internal', 'Alice Admin'),
    engLead: createToken('usr-eng-lead', 'lead.eng@newtonite.internal', 'Elena Vance'),
    engDev: createToken('usr-eng-dev', 'dev.eng@newtonite.internal', 'Dave Miller'),
    engViewer: createToken('usr-eng-view', 'viewer.eng@newtonite.internal', 'Victor Vance'),
    payLead: createToken('usr-pay-lead', 'lead.pay@newtonite.internal', 'Priya Patel'),
    payOps: createToken('usr-pay-ops', 'ops.pay@newtonite.internal', 'Omar Farooq'),
    compLead: createToken('usr-comp-lead', 'lead.comp@newtonite.internal', 'Claire Dupont'),
    compAuditor: createToken('usr-comp-aud', 'auditor.comp@newtonite.internal', 'Arthur Dent'),
    opsLead: createToken('usr-ops-lead', 'lead.ops@newtonite.internal', 'Sarah Jenkins'),
    opsAgent: createToken('usr-ops-agent', 'agent.ops@newtonite.internal', 'Alex Rivera'),
    crossTeam: createToken('usr-cross-team', 'cross.team@newtonite.internal', 'Chris Cross'),
  };

  return {
    db,
    app,
    outboxService,
    tokens,
  };
}
