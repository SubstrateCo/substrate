/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { setupDatabase } from "../../testing/database";
import { user } from "../../core/authentication/schema";
import { createContextService } from "./service";
import { createMessagingService } from "../messaging/service";
const f = setupDatabase();

test("search finds each supported domain without leaking private work, and cursor pages do not overlap", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Launch" });
  const titles = ["Launch one", "Launch two", "Launch three"];
  for (const title of titles)
    await alice.tasks.create({ projectEntityId: project.entityId, title });
  const chat = createMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({ kind: "channel", name: "Launch", private: true });
  const message = await chat.sendMessage(channel.id, "Launch discussion");
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  expect((await context.search({ query: "Launch" })).map((row) => row.kind).sort()).toEqual([
    "conversation",
    "message",
    "project",
    "task",
    "task",
    "task",
  ]);
  expect(await context.search({ query: "Laun", kind: "task" })).toHaveLength(3);
  const first = await context.search({ query: "Launch", kind: "task", limit: 2 });
  const second = await context.search({
    query: "Launch",
    kind: "task",
    after: first.at(-1)!.id,
    limit: 2,
  });
  expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(3);
  const bob = createContextService(f.db, { userId: "bob", organizationId: f.orgA });
  expect(await bob.search({ query: "Launch" })).toEqual([]);
  await chat.addMembers(channel.id, ["bob@example.com"]);
  expect((await bob.search({ query: "Launch", kind: "message" })).map((row) => row.id)).toEqual([
    message.id,
  ]);
  await alice.entities.softDelete(project.entityId);
  expect(await context.search({ query: "Launch", kind: "task" })).toEqual([]);
});
