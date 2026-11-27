import { decodeAvatarCode, withAvatarChoices } from "@substrate/agent-avatars/config";

import { userAgents } from "./schema";
import { setupDatabase } from "./testing/database";
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";

const f = setupDatabase();

test("the avatar migration gives existing agents valid looks with readable eyes", async () => {
  const migration = readFileSync(
    new URL("../migrations/0001_agent_avatars.sql", import.meta.url),
    "utf8",
  );
  const backfill = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .find((statement) => statement.includes('UPDATE "user_agents" SET "avatar_code"'));
  expect(backfill).toBeDefined();
  await f.db.insert(userAgents).values(
    Array.from({ length: 500 }, (_, index) => ({
      userId: "alice",
      name: `Agent ${index}`,
      instructions: "",
      avatarCode: "100000",
      harness: "claude" as const,
    })),
  );
  await f.db.execute(sql.raw(backfill!));
  const codes = (await f.db.select({ code: userAgents.avatarCode }).from(userAgents)).map(
    (row) => row.code,
  );
  expect(codes).toHaveLength(500);
  for (const code of codes) {
    expect(decodeAvatarCode(code)).not.toBeNull();
    // Choosing nothing keeps the code only when its eyes are readable on its colour.
    expect(withAvatarChoices(code, {})).toBe(code);
  }
  // The look depends on the agent ID, so existing agents do not all look alike.
  expect(new Set(codes).size).toBeGreaterThan(20);
});
