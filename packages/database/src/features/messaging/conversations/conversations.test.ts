import { AccessDeniedError, ValidationError } from "../../../errors";
import { user, member, entityGrants, actors } from "../../../schema";
import { ownedAgent } from "../../../testing/agents";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { messagingConversations, messagingMessages, messagingParticipants } from "../schema";
import { createMessagingService } from "../service";
import { messagingInvitations } from "../sharing.schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();
const service = fixture.messaging;
const verified = fixture.verifyEmails;

test("concurrent normalized external DM starts queue only one invitation", async () => {
  await verified();
  const chat = createMessagingService(fixture.db, {
    userId: "alice",
    organizationId: fixture.orgA,
  });
  const [first, second] = await Promise.all([
    chat.createConversation({ kind: "dm", emails: [" OUTSIDE@example.com "], shareHistory: true }),
    chat.createConversation({ kind: "dm", emails: ["outside@example.com"], shareHistory: true }),
  ]);
  expect(first.id).toBe(second.id);
  expect(await fixture.db.select().from(messagingConversations)).toHaveLength(1);
  expect(await fixture.db.select().from(messagingParticipants)).toHaveLength(1);
  expect(await fixture.db.select().from(messagingInvitations)).toMatchObject([
    { conversationId: first.id, email: "outside@example.com", status: "pending" },
  ]);
});

test("expired and revoked external invitations release their DM key for concurrent re-invites", async () => {
  await verified();
  const chat = createMessagingService(fixture.db, {
    userId: "alice",
    organizationId: fixture.orgA,
  });
  for (const status of ["expired", "revoked"] as const) {
    const input = { kind: "dm" as const, emails: [`${status}@example.com`], shareHistory: true };
    const old = await chat.createConversation(input);
    await fixture.db
      .update(messagingInvitations)
      .set(status === "expired" ? { expiresAt: new Date(0) } : { status: "revoked" })
      .where(eq(messagingInvitations.conversationId, old.id));
    const [first, second] = await Promise.all([
      chat.createConversation(input),
      chat.createConversation(input),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.id).not.toBe(old.id);
    expect(
      await fixture.db
        .select({ key: messagingConversations.dmKey })
        .from(messagingConversations)
        .where(eq(messagingConversations.id, old.id)),
    ).toEqual([{ key: null }]);
    expect(
      await fixture.db
        .select()
        .from(messagingInvitations)
        .where(eq(messagingInvitations.conversationId, first.id)),
    ).toHaveLength(1);
  }
});

test("conversation views do not disclose the DM key", async () => {
  await verified();
  const chat = service("alice");
  const views = [
    await chat.createConversation({ kind: "dm", emails: ["bob@example.com"] }),
    await chat.createConversation({ kind: "dm", emails: ["bob@example.com"] }),
    await chat.createConversation({ kind: "dm", emails: ["outside@example.com"] }),
    await chat.createConversation({ kind: "dm", emails: ["outside@example.com"] }),
    ...(await chat.listConversations()),
  ];
  expect(views).toHaveLength(6);
  for (const view of views) expect(view).not.toHaveProperty("dmKey");
});

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
  expect(await rejection(service("bob").listMessages(dm.id))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(service("outsider", fixture.orgA).listConversations())).toBeInstanceOf(
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
  expect(
    await rejection(service("outsider", fixture.orgB).sendMessage(publicChannel.id, "no")),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(service("bob").sendMessage(privateChannel.id, "no"))).toBeInstanceOf(
    AccessDeniedError,
  );
  await service("bob").sendMessage(publicChannel.id, "joined");
  expect(
    await rejection(service("bob").addMembers(publicChannel.id, ["outside@example.com"])),
  ).toBeInstanceOf(AccessDeniedError);
  await service("alice").addMembers(privateChannel.id, ["outside@example.com"]);
  expect(
    (await service("outsider", fixture.orgB).listConversations()).map((row) => row.id),
  ).toEqual([privateChannel.id]);
});

test("unapproved external recipients require a history confirmation and invalid recipients roll back", async () => {
  await verified();
  await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "bob"));
  expect(
    await rejection(service("alice").createConversation({ kind: "dm", emails: ["outside"] })),
  ).toBeInstanceOf(ValidationError);
  expect(
    await rejection(
      createMessagingService(fixture.db, {
        userId: "alice",
        organizationId: fixture.orgA,
      }).createConversation({
        kind: "group",
        emails: ["outside@example.com", "bob@example.com"],
      }),
    ),
  ).toBeInstanceOf(ValidationError);
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
  expect(await fixture.db.select().from(messagingParticipants)).toEqual([]);
  await fixture.db.delete(member).where(eq(member.userId, "outsider"));
  expect(
    await rejection(
      createMessagingService(fixture.db, {
        userId: "alice",
        organizationId: fixture.orgA,
      }).createConversation({ kind: "dm", emails: [" OUTSIDE@example.com "] }),
    ),
  ).toBeInstanceOf(ValidationError);
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
});

test("group DMs support multiple recipients and caller transactions roll back all records", async () => {
  await verified();
  expect(
    await rejection(
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
    ),
  ).toMatchObject({ message: expect.stringContaining("abort") });
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
  expect(await rejection(service("bob", fixture.orgB).listMessages(dm.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection(service("bob", fixture.orgB).sendMessage(channel.id, "wrong scope")),
  ).toBeInstanceOf(AccessDeniedError);
  await fixture.db.delete(member).where(eq(member.id, "bob-a"));
  expect(await rejection(service("bob").listConversations())).toBeInstanceOf(AccessDeniedError);
  expect(await service("bob", fixture.orgB).listConversations()).toEqual([]);
  expect(
    await rejection(service("bob", fixture.orgB).toggleReaction(sent.id, "👍")),
  ).toBeInstanceOf(AccessDeniedError);
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
  expect(await fixture.db.select().from(messagingConversations)).toHaveLength(1);
  expect(await fixture.db.select().from(messagingParticipants)).toHaveLength(2);
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

test("starting a DM with the same agent returns the existing DM", async () => {
  const agent = await ownedAgent(fixture);
  const chat = service("alice");
  const input = { kind: "agent_dm" as const, agentIds: [agent.agentId] };
  const [dm, concurrent] = await Promise.all([
    chat.createConversation(input),
    chat.createConversation(input),
  ]);
  expect(concurrent.id).toBe(dm.id);
  expect((await chat.createConversation(input)).id).toBe(dm.id);
  expect(await fixture.db.select().from(messagingConversations)).toHaveLength(1);
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
  expect(await rejection(service("bob").listConversations())).toBeInstanceOf(AccessDeniedError);
  await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "alice"));
  expect(
    await rejection(service("alice").createConversation({ kind: "channel", name: "blocked" })),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
});
