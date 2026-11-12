import { createDatabase, migrateDatabase } from "@substrate/database/trusted";

import { sql } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;
const target = connectionString ? new URL(connectionString) : undefined;
if (
  !target ||
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/substrate_load"
)
  throw new Error("Load testing requires the substrate_load database on localhost.");

// Explicit values isolate this server from Bun's automatically loaded developer .env files.
Object.assign(process.env, {
  NODE_ENV: "development",
  DATABASE_URL: connectionString,
  DATABASE_POOL_SIZE: process.env.DATABASE_POOL_SIZE ?? "10",
  SERVER_METRICS: process.env.SERVER_METRICS ?? "0",
  SUBSTRATE_API_URL: "http://localhost:3201",
  SUBSTRATE_WEB_URL: "http://localhost:3200",
  SERVER_PORT: "3201",
  FRONTEND_ORIGINS: "",
  SUBSTRATE_WINDOWS_DOWNLOAD_URL: "",
  VALKEY_URL: "redis://localhost:6380",
  REALTIME_CHANNEL: "substrate:realtime:load",
  BETTER_AUTH_SECRET: "substrate-load-only-secret-not-for-production",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1026",
  SMTP_SECURE: "false",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  EMAIL_FROM: "Substrate Load <load@load.test>",
  S3_ENDPOINT: "http://localhost:4567",
  S3_REGION: "us-east-1",
  S3_BUCKET: "substrate-private",
  S3_ACCESS_KEY_ID: "substrate",
  S3_SECRET_ACCESS_KEY: "substrate_storage",
});

const { db, close } = createDatabase({ connectionString: connectionString!, maxConnections: 1 });
try {
  await migrateDatabase(db);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`);
} finally {
  await close();
}

await import("../src/main");
