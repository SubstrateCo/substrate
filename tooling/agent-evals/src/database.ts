import { createDatabase, migrateDatabase } from "@substrate/database/trusted";

import { sql } from "drizzle-orm";
import postgres from "postgres";

/**
 * A migrated database for one eval run, on the test PostgreSQL server. It is dropped when the
 * run ends. Evals never use the development or the unit test database.
 */
export async function createEvalDatabase() {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is required. Start it with bun run services:test.");
  const url = new URL(base);
  if (!url.pathname.endsWith("_test")) throw new Error("The test database name must end in _test.");
  const name = `substrate_evals_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
  const admin = postgres(url.href, { max: 1 });
  // A stopped run leaves its database behind. One eval run at a time uses this server.
  const stale = await admin<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname LIKE 'substrate_evals_%_test'`;
  for (const row of stale) await admin`DROP DATABASE ${admin(row.datname)} WITH (FORCE)`;
  await admin`CREATE DATABASE ${admin(name)}`;
  url.pathname = `/${name}`;
  // One connection, so that the notice level applies to every migration statement.
  const migration = createDatabase({ connectionString: url.href, maxConnections: 1 });
  try {
    await migration.db.execute(sql`SET client_min_messages TO WARNING`);
    await migrateDatabase(migration.db);
  } catch (error) {
    await migration.close();
    await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`;
    await admin.end();
    throw error;
  }
  await migration.close();
  const database = createDatabase({ connectionString: url.href, maxConnections: 20 });
  return {
    db: database.db,
    async close() {
      await database.close();
      await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`;
      await admin.end();
    },
  };
}
