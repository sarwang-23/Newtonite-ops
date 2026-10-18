import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'newtonite-operations-under-pressure-secure-jwt-token-2026',
  databaseUrl: process.env.DATABASE_URL || '',
  outboxPollIntervalMs: parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || '3000', 10),
};
