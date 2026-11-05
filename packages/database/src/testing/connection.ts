import { is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { createDatabase } from "../client";
import * as schema from "../schema";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("TEST_DATABASE_URL is required. Use the dedicated test database.");
const url = new URL(connectionString);
if (!url.pathname.endsWith("_test")) throw new Error("The test database name must end in _test.");
if (process.env.DATABASE_URL && connectionString === process.env.DATABASE_URL) {
  throw new Error("Tests must not use DATABASE_URL.");
}

const connection = createDatabase({ connectionString, maxConnections: 4 });
export const testDatabase = connection.db;
export const closeTestDatabase = connection.close;

const tables = Object.values(schema).filter((value) => is(value, PgTable));
export const resetTestData = sql`TRUNCATE TABLE ${sql.join(
  tables.map((table) => sql`${table}`),
  sql`, `,
)}`;
