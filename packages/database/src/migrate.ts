import { createDatabase } from "./client";
import { migrateDatabase } from "./migrations";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const { db, close } = createDatabase({ connectionString, maxConnections: 1 });
try {
  await migrateDatabase(db);
} finally {
  await close();
}
