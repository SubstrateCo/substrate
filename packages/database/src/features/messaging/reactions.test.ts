import { AccessDeniedError } from "../../errors";
import {
  member,
  messagingParticipants,
  messagingReactions,
  storedFiles,
  user,
  userAgents,
} from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { createMessagingService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();
const service = fixture.messaging;

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
    expect(await rejection(viewer.listReactions(message.id))).toBeInstanceOf(AccessDeniedError);
  }
  expect(await rejection(service("bob").listReactions(crypto.randomUUID()))).toBeInstanceOf(
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

test("joined reactor metadata keeps agent pictures owner-only and partner pictures tied to viewer membership", async () => {
  const agent = await ownedAgent(fixture);
  const image = `/api/v1/files/pictures/avatar/outsider?v=${crypto.randomUUID()}`;
  await fixture.db.update(user).set({ image }).where(eq(user.id, "outsider"));
  const fileId = crypto.randomUUID();
  await fixture.db.insert(storedFiles).values({
    id: fileId,
    ownerUserId: "alice",
    uploadedBy: "alice",
    purpose: "avatar",
    filename: "agent.webp",
    contentType: "image/webp",
    size: 10,
    objectKey: `pictures/${fileId}`,
    sha256: "hash",
  });
  await fixture.db
    .update(userAgents)
    .set({ imageFileId: fileId })
    .where(eq(userAgents.id, agent.agentId));
  const channel = await service("alice").createConversation({
    kind: "channel",
    name: "Metadata",
    emails: ["outside@example.com", "bob@example.com"],
  });
  await fixture.db.insert(messagingParticipants).values({
    organizationId: fixture.orgA,
    conversationId: channel.id,
    actorEntityId: agent.actorId,
    actorType: "agent",
  });
  const message = await service("alice").sendMessage(channel.id, "Metadata");
  await fixture.db.insert(messagingReactions).values(
    [agent.actorId, fixture.outsider].map((actorEntityId) => ({
      messageId: message.id,
      conversationId: channel.id,
      actorEntityId,
      emoji: "👍",
    })),
  );
  const recording = recordQueries();
  const owner = createMessagingService(recording.db, {
    userId: "alice",
    organizationId: fixture.orgA,
  });
  expect((await owner.listReactions(message.id)).items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        actorId: agent.actorId,
        name: "Research",
        image: `/api/v1/files/${fileId}/content`,
      }),
      expect.objectContaining({ actorId: fixture.outsider, name: "Outsider", image: null }),
    ]),
  );
  const query = recording.queries.find((query) => query.includes("array_agg"))!;
  expect(query).toContain('left join "user_agents"');
  expect(query).toContain('left join "member"');
  expect(query).not.toMatch(/dn_user|dn_agent|picture_user|picture_agent|picture_member/);
  expect(
    (await service("bob").listReactions(message.id)).items.every((row) => row.image === null),
  ).toBe(true);
  await fixture.db
    .insert(member)
    .values({
      id: crypto.randomUUID(),
      organizationId: fixture.orgA,
      userId: "outsider",
      role: "member",
    });
  expect(
    (await service("bob").listReactions(message.id)).items.find(
      (row) => row.actorId === fixture.outsider,
    )?.image,
  ).toBe(image);
  await fixture.db
    .update(user)
    .set({ image: "https://example.test/tracker.png" })
    .where(eq(user.id, "outsider"));
  expect(
    (await service("bob").listReactions(message.id)).items.find(
      (row) => row.actorId === fixture.outsider,
    )?.image,
  ).toBeNull();
});
