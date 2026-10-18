import { config } from './config.js';
import { getDatabase } from './db/index.js';
import { initializeSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { OutboxService } from './services/outbox.service.js';
import { createApp } from './server.js';

async function bootstrap() {
  console.log('🚀 Initializing Newtonite Operations Under Pressure platform...');
  const db = getDatabase();

  // Initialize schema
  await initializeSchema(db);

  // Check if seeded; if not, seed automatically
  const userCount = await db.get<{ count: number }>('SELECT count(*) as count FROM users');
  if (!userCount || Number(userCount.count) === 0) {
    console.log('📦 Database is empty. Automatically seeding demo users, teams, and sample items...');
    await seedDatabase(db);
  } else {
    console.log(`✅ Database ready. Found ${userCount.count} registered users.`);
  }

  // Initialize background outbox processor
  const outboxService = new OutboxService(db);
  outboxService.startWorker(config.outboxPollIntervalMs);
  console.log(`⚙️ Background Transactional Outbox worker started (polling every ${config.outboxPollIntervalMs}ms).`);

  // Start Express API & Static Server
  const app = createApp(db, outboxService);
  const server = app.listen(config.port, () => {
    console.log(`\n======================================================`);
    console.log(`🎯 Newtonite Operations Under Pressure running at:`);
    console.log(`   http://localhost:${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
    console.log(`   Database:    ${db.isPostgres() ? 'PostgreSQL' : 'SQLite (WAL Mode)'}`);
    console.log(`======================================================\n`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Gracefully shutting down Newtonite Ops...');
    outboxService.stopWorker();
    server.close(async () => {
      await db.close();
      console.log('👋 Newtonite Ops server terminated cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
