import { setupDatabase } from "../../testing/database";
import { visibleConversations } from "./access";
import { messagingConversations } from "./schema";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("listing visible conversations computes the viewer's memberships once", async () => {
  const query = f.db
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .where(visibleConversations(f.db, { userId: "alice", organizationId: f.orgA }))
    .toSQL();
  const plan = await f.db.$client.unsafe<{ "QUERY PLAN": string }[]>(
    `explain ${query.sql}`,
    // SAFETY: toSQL() returns the values drizzle itself binds for this statement.
    query.params as never[],
  );
  const filter = plan.map((row) => row["QUERY PLAN"]).find((line) => line.includes("Filter:"));
  expect(filter).toMatch(/ANY \(id = \(hashed SubPlan \d+\)/);
});
