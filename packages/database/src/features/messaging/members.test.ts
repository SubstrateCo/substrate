import { user, userAgents } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { activeMembers } from "./members";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("conversation members resolve names and pictures with joins in one statement", async () => {
  await f.verifyEmails();
  const conversation = await f
    .messaging("alice")
    .createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const { db, queries } = recordQueries();
  const members = await activeMembers(db, [conversation.id], {
    userId: "alice",
    organizationId: f.orgA,
  });
  expect(
    members.get(conversation.id)?.map((row) => ({ name: row.name, image: row.image })),
  ).toEqual([
    { name: "Alice", image: null },
    { name: "Bob", image: null },
  ]);
  expect(queries).toHaveLength(1);
  expect(queries[0]).not.toMatch(/dn_user|dn_agent|picture_user|picture_agent/);
});

test("joined member metadata keeps partner pictures and other owners' agent IDs private", async () => {
  await f.verifyEmails();
  const image = `/api/v1/files/pictures/avatar/alice?v=${crypto.randomUUID()}`;
  await f.db.update(user).set({ image }).where(eq(user.id, "alice"));
  const [agent] = await f.db
    .insert(userAgents)
    .values({ userId: "alice", name: "Scout", instructions: "", harness: "opencode" })
    .returning();
  const chat = f.messaging("alice");
  const conversation = await chat.createConversation({
    kind: "channel",
    name: "Partners",
    emails: ["outside@example.com"],
    agentIds: [agent!.id],
  });
  const own = (
    await activeMembers(f.db, [conversation.id], { userId: "alice", organizationId: f.orgA })
  ).get(conversation.id)!;
  const partner = (
    await activeMembers(f.db, [conversation.id], { userId: "outsider", organizationId: f.orgB })
  ).get(conversation.id)!;
  expect(own.find((row) => row.userId === "alice")?.image).toBe(image);
  expect(partner.find((row) => row.userId === "alice")?.image).toBeNull();
  expect(own.find((row) => row.type === "agent")).toMatchObject({
    name: "Scout",
    agentId: agent!.id,
  });
  expect(partner.find((row) => row.type === "agent")).toMatchObject({
    name: "Scout",
    agentId: null,
    image: null,
  });
});
