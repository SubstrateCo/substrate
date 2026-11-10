import { AccessDeniedError } from "../../errors";
import { user } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { createAcceptedMessagingService } from "../../testing/messaging";
import { expect, test } from "bun:test";

const fixture = setupDatabase();
const service = (userId: string, organizationId = fixture.orgA) =>
  createAcceptedMessagingService(fixture.db, { userId, organizationId });

test("reactor pages are bounded, message-local, filterable and deduplicate people", async () => {
  await fixture.db.update(user).set({ emailVerified: true });
  const alice = service("alice");
  const bob = service("bob");
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  const first = await alice.sendMessage(channel.id, "first");
  const second = await alice.sendMessage(channel.id, "second");
  await alice.toggleReaction(first.id, "👍");
  await alice.toggleReaction(first.id, "❤️");
  await bob.toggleReaction(first.id, "👍");
  await bob.toggleReaction(second.id, "🎉");
  const page = await alice.listReactions(first.id, { limit: 1 });
  expect(page.items).toHaveLength(1);
  expect(page.nextCursor).toBe(page.items[0]!.actorId);
  const next = await alice.listReactions(first.id, { afterActorId: page.nextCursor!, limit: 1 });
  expect(next.items).toHaveLength(1);
  expect(next.nextCursor).toBeNull();
  const people = [...page.items, ...next.items];
  expect(people.map((person) => person.name).sort()).toEqual(["Alice", "Bob"]);
  expect(people.find((person) => person.name === "Alice")).toMatchObject({
    self: true,
    emojis: ["❤️", "👍"],
  });
  expect(people.find((person) => person.name === "Bob")).toMatchObject({
    self: false,
    emojis: ["👍"],
  });
  const hearts = await alice.listReactions(first.id, { emoji: "❤️" });
  expect(hearts.items.map((person) => person.name)).toEqual(["Alice"]);
  expect(await alice.listReactions(first.id, { emoji: "🎉" })).toEqual({
    items: [],
    nextCursor: null,
  });
});

test("reactor names require message read access, including organization owners", async () => {
  await fixture.db.update(user).set({ emailVerified: true });
  const channel = await service("bob").createConversation({
    kind: "channel",
    private: true,
    name: "private",
  });
  const message = await service("bob").sendMessage(channel.id, "private");
  await service("bob").toggleReaction(message.id, "👍");
  for (const viewer of [service("alice"), service("outsider", fixture.orgB)]) {
    // oxlint-disable-next-line typescript/await-thenable -- Bun's rejects matcher returns a promise.
    await expect(viewer.listReactions(message.id)).rejects.toBeInstanceOf(AccessDeniedError);
  }
  // oxlint-disable-next-line typescript/await-thenable -- Bun's rejects matcher returns a promise.
  await expect(service("bob").listReactions(crypto.randomUUID())).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("partner reactors reuse conversation-scoped profiles without revealing member-only details", async () => {
  await fixture.db.update(user).set({ emailVerified: true });
  const alice = service("alice");
  const partner = service("outsider", fixture.orgB);
  const channel = await alice.createConversation({
    kind: "channel",
    name: "shared",
    private: true,
    emails: ["outside@example.com"],
  });
  const message = await alice.sendMessage(channel.id, "shared");
  await partner.toggleReaction(message.id, "👍");
  const page = await alice.listReactions(message.id);
  expect(page.items).toMatchObject([
    { actorId: fixture.outsider, name: "Outsider", image: null, self: false },
  ]);
  expect(await alice.getProfile(channel.id, fixture.outsider)).toMatchObject({
    name: "Outsider",
    external: true,
    email: null,
    image: null,
  });
});
