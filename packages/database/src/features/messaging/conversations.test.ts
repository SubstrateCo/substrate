import { AccessDeniedError, ValidationError } from "../../errors";
import { user, member, entityGrants, actors } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { createAcceptedMessagingService } from "../../testing/messaging";
import { messagingConversations, messagingMessages, messagingParticipants } from "./schema";
import { createMessagingService } from "./service";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();
const service = (userId: string, organizationId = fixture.orgA) =>
  createAcceptedMessagingService(fixture.db, { userId, organizationId });
async function verified() {
  await fixture.db.update(user).set({ emailVerified: true });
}

test("cross-org DMs use explicit participants without adding entity grants", async () => {
  await verified();
  const before = await fixture.db.select().from(entityGrants);
  const dm = await service("alice").createConversation({
    kind: "dm",
    emails: ["outside@example.com"],
  });
  const sent = await service("alice").sendMessage(dm.id, "Across organizations");
  expect(
    (await service("outsider", fixture.orgB).listConversations()).map((row) => row.id),
  ).toEqual([dm.id]);
  expect(await service("outsider", fixture.orgB).listMessages(dm.id)).toMatchObject([
    { id: sent.id, authorName: "Alice", body: "Across organizations" },
  ]);
  await expect(service("bob").listMessages(dm.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(service("outsider", fixture.orgA).listConversations()).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await fixture.db.select().from(entityGrants)).toEqual(before);
});

test("public channels are org-scoped, private channels need membership, only creator adds members", async () => {
  await verified();
  const publicChannel = await service("alice").createConversation({
    kind: "channel",
    name: "general",
  });
  const privateChannel = await service("alice").createConversation({
    kind: "channel",
    name: "private",
    private: true,
  });
  expect((await service("bob").listConversations()).map((row) => row.id)).toEqual([
    publicChannel.id,
  ]);
  expect(await service("outsider", fixture.orgB).listConversations()).toEqual([]);
  await expect(
    service("outsider", fixture.orgB).sendMessage(publicChannel.id, "no"),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(service("bob").sendMessage(privateChannel.id, "no")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await service("bob").sendMessage(publicChannel.id, "joined");
  await expect(
    service("bob").addMembers(publicChannel.id, ["outside@example.com"]),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await service("alice").addMembers(privateChannel.id, ["outside@example.com"]);
  expect(
    (await service("outsider", fixture.orgB).listConversations()).map((row) => row.id),
  ).toEqual([privateChannel.id]);
});

test("unapproved external recipients require a history confirmation and invalid recipients roll back", async () => {
  await verified();
  await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "bob"));
  await expect(
    service("alice").createConversation({ kind: "dm", emails: ["outside"] }),
  ).rejects.toBeInstanceOf(ValidationError);
  await expect(
    createMessagingService(fixture.db, {
      userId: "alice",
      organizationId: fixture.orgA,
    }).createConversation({
      kind: "group",
      emails: ["outside@example.com", "bob@example.com"],
    }),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
  expect(await fixture.db.select().from(messagingParticipants)).toEqual([]);
  await fixture.db.delete(member).where(eq(member.userId, "outsider"));
  await expect(
    createMessagingService(fixture.db, {
      userId: "alice",
      organizationId: fixture.orgA,
    }).createConversation({ kind: "dm", emails: [" OUTSIDE@example.com "] }),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
});

test("group DMs support multiple recipients and caller transactions roll back all records", async () => {
  await verified();
  await expect(
    fixture.db.transaction(async (tx) => {
      const group = await createMessagingService(tx, {
        userId: "alice",
        organizationId: fixture.orgA,
      }).createConversation({
        kind: "group",
        emails: ["bob@example.com", "outside@example.com"],
        shareHistory: true,
      });
      await createMessagingService(tx, {
        userId: "alice",
        organizationId: fixture.orgA,
      }).sendMessage(group.id, "rollback");
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
  expect(await fixture.db.select().from(messagingMessages)).toEqual([]);
  const group = await service("alice").createConversation({
    kind: "group",
    emails: ["bob@example.com", "outside@example.com"],
  });
  expect(await service("outsider", fixture.orgB).listMessages(group.id)).toEqual([]);
  expect(
    (
      await fixture.db
        .select({ actorEntityId: messagingParticipants.actorEntityId })
        .from(messagingParticipants)
        .where(eq(messagingParticipants.conversationId, group.id))
    )
      .map((row) => row.actorEntityId)
      .sort(),
  ).toEqual([fixture.alice, fixture.bob, fixture.outsider].sort());
});

test("participant access is bound to the recipient organization and departure preserves history but revokes access", async () => {
  await verified();
  await fixture.db
    .insert(member)
    .values({ id: "bob-b", userId: "bob", organizationId: fixture.orgB });
  const dm = await service("alice").createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const channel = await service("alice").createConversation({
    kind: "channel",
    name: "restricted",
    private: true,
    emails: ["bob@example.com"],
  });
  const sent = await service("bob").sendMessage(dm.id, "retain my history");
  expect((await service("bob").listConversations()).map((row) => row.id).sort()).toEqual(
    [dm.id, channel.id].sort(),
  );
  expect(await service("bob", fixture.orgB).listConversations()).toEqual([]);
  await expect(service("bob", fixture.orgB).listMessages(dm.id)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await expect(
    service("bob", fixture.orgB).sendMessage(channel.id, "wrong scope"),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await fixture.db.delete(member).where(eq(member.id, "bob-a"));
  await expect(service("bob").listConversations()).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await service("bob", fixture.orgB).listConversations()).toEqual([]);
  await expect(service("bob", fixture.orgB).toggleReaction(sent.id, "👍")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await service("alice").listMessages(dm.id)).toMatchObject([
    { id: sent.id, body: "retain my history" },
  ]);
});

test("starting a DM with the same person returns the existing DM", async () => {
  await verified();
  // Both people start the DM at the same moment.
  const [dm, reverse] = await Promise.all([
    service("alice").createConversation({ kind: "dm", emails: ["bob@example.com"] }),
    service("bob").createConversation({ kind: "dm", emails: ["alice@example.com"] }),
  ]);
  expect(reverse.id).toBe(dm.id);
  expect(
    (await service("alice").createConversation({ kind: "dm", emails: ["bob@example.com"] })).id,
  ).toBe(dm.id);
  const partner = await service("alice").createConversation({
    kind: "dm",
    emails: ["outside@example.com"],
  });
  expect(partner.id).not.toBe(dm.id);
  const group = await service("alice").createConversation({
    kind: "group",
    emails: ["bob@example.com", "outside@example.com"],
  });
  expect(group.id).not.toBe(dm.id);
  expect(
    await fixture.db
      .select()
      .from(messagingConversations)
      .where(eq(messagingConversations.kind, "dm")),
  ).toHaveLength(2);
});

test("unnamed DMs and groups have participant display names", async () => {
  await verified();
  const dm = await service("alice").createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const group = await service("alice").createConversation({
    kind: "group",
    emails: ["bob@example.com", "outside@example.com"],
  });
  expect(await service("alice").listConversations()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: dm.id, name: "Bob" }),
      expect.objectContaining({ id: group.id, name: "Bob, Outsider" }),
    ]),
  );
  expect(await service("bob").listConversations()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: dm.id, name: "Alice" })]),
  );
});

test("disabled actors and unverified callers cannot use messaging", async () => {
  await verified();
  await fixture.db
    .update(actors)
    .set({ disabledAt: new Date() })
    .where(eq(actors.entityId, fixture.bob));
  await expect(service("bob").listConversations()).rejects.toBeInstanceOf(AccessDeniedError);
  await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "alice"));
  await expect(
    service("alice").createConversation({ kind: "channel", name: "blocked" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
});
