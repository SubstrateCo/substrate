import { is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { createDatabase } from "../client";
import * as schema from "../schema";
import { testDatabaseURL } from "./environment";

const connection = createDatabase({ connectionString: testDatabaseURL().href, maxConnections: 4 });
export const testDatabase = connection.db;
export const closeTestDatabase = connection.close;

const tables = Object.values(schema).filter((value) => is(value, PgTable));
export const resetTestData = sql`TRUNCATE TABLE ${sql.join(
  tables.map((table) => sql`${table}`),
  sql`, `,
)}`;
