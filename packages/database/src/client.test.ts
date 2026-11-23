import { testDatabase } from "./testing/connection";
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";

test("database connections use UTC for SQL time zone operations", async () => {
  const rows = await testDatabase.execute(sql`SHOW TIME ZONE`);
  expect(rows[0]?.TimeZone).toBe("UTC");
});
