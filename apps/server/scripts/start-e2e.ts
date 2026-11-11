import { createDatabase, migrateDatabase } from "@substrate/database/trusted";

import { sql } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.endsWith("_e2e_test"))
  throw new Error("E2E requires a dedicated database ending in _e2e_test.");
if (process.env.NODE_ENV !== "test") throw new Error("E2E requires NODE_ENV=test.");

const { db, close } = createDatabase({ connectionString, maxConnections: 1 });
try {
  await migrateDatabase(db);
  // The dedicated E2E server never reuses a running server or the unit-test database.
  // Reset only application tables; Drizzle keeps its migration history in its own schema.
  await db.execute(sql`
    DO $$ DECLARE tables text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables
      FROM pg_tables WHERE schemaname = 'public';
      IF tables IS NOT NULL THEN EXECUTE 'TRUNCATE ' || tables || ' CASCADE'; END IF;
    END $$;
  `);
} finally {
  await close();
}

await import("../src/main");
