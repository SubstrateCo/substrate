import { afterAll, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { migrateDatabase } from "../migrations";
import { closeTestDatabase, testDatabase } from "./connection";

beforeAll(async () => {
  await testDatabase.execute(sql`SET client_min_messages TO WARNING`);
  await migrateDatabase(testDatabase);
});

afterAll(closeTestDatabase);
