import { messagingLimits } from "@substrate/contracts/messaging/input";

import { AccessDeniedError, ValidationError } from "../../../errors";
import { actors, entityGrants, member, organization, user } from "../../../schema";
import { setupDatabase } from "../../../testing/database";
import { recordQueries } from "../../../testing/queries";
import { rejection } from "../../../testing/rejection";
import { messagingConversations, messagingParticipants } from "../schema";
import { createMessagingService } from "../service";
import { createSharingService } from "../sharing/service";
import { expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

const fixture = setupDatabase();

function recordedService() {
  const recording = recordQueries();
  return {
    ...recording,
    chat: createMessagingService(recording.db, {
      userId: "alice",
      organizationId: fixture.orgA,
    }),
    lookups: () =>
      recording.queries.filter(
        (query) => query.includes('"user"."email" in') && query.includes('inner join "member"'),
      ),
  };
}

test("the most recipients use one lookup for creation and member addition", async () => {
  await fixture.db.update(user).set({ emailVerified: true });
  const recipients = Array.from({ length: messagingLimits.recipients }, (_, index) => ({
    id: `recipient-${index}`,
    name: `Recipient ${index}`,
    email: `recipient-${index}@example.com`,
    emailVerified: true,
  }));
  await fixture.db.insert(user).values(recipients);
  await fixture.db
    .insert(member)
    .values(recipients.map(({ id }) => ({ id, userId: id, organizationId: fixture.orgA })));
  const { chat, queries, lookups } = recordedService();
  const group = await chat.createConversation({
    kind: "group",
    emails: recipients.map(({ email }) => email),
  });
  expect(
    await fixture.db
      .select({
        userId: actors.userId,
        organizationId: messagingParticipants.organizationId,
      })
      .from(messagingParticipants)
      .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
      .where(eq(messagingParticipants.conversationId, group.id)),
  ).toEqual(
    expect.arrayContaining([
      { userId: "alice", organizationId: fixture.orgA },
      ...recipients.map(({ id }) => ({ userId: id, organizationId: fixture.orgA })),
    ]),
  );
  expect(lookups()).toHaveLength(1);
  const channel = await chat.createConversation({ kind: "channel", name: "partners" });
  queries.length = 0;
  expect(
    await chat.addMembers(
      channel.id,
      recipients.map(({ email }) => email),
    ),
  ).toEqual({
    added: messagingLimits.recipients,
  });
  expect(lookups()).toHaveLength(1);
  // The recipients have actors now, so the lookup returns them without per-person statements.
  expect(queries.length).toBeLessThan(20);
  expect(
    await fixture.db
      .select()
      .from(messagingParticipants)
      .where(eq(messagingParticipants.conversationId, group.id)),
  ).toHaveLength(messagingLimits.recipients + 1);
});

test("first-use recipients get actors in the same statements for few or many people", async () => {
  await fixture.db.update(user).set({ emailVerified: true });
  const recipients = Array.from({ length: messagingLimits.recipients }, (_, index) => ({
    id: `recipient-${index}`,
    name: `Recipient ${index}`,
    email: `recipient-${index}@example.com`,
    emailVerified: true,
  }));
  await fixture.db.insert(user).values(recipients);
  await fixture.db
    .insert(member)
    .values(recipients.map(({ id }) => ({ id, userId: id, organizationId: fixture.orgA })));
  const counts = [];
  for (const group of [recipients.slice(0, 2), recipients.slice(2)]) {
    const { chat, queries } = recordedService();
    const conversation = await chat.createConversation({
      kind: "group",
      emails: group.map(({ email }) => email),
    });
    counts.push(queries.length);
    const participants = await fixture.db
      .select({ userId: actors.userId, entityId: actors.entityId })
      .from(messagingParticipants)
      .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
      .where(eq(messagingParticipants.conversationId, conversation.id));
    expect(
      participants.map(({ userId }) => userId).sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual(["alice", ...group.map(({ id }) => id)].sort());
    // Provisioned people own their actor, as single provisioning grants.
    const created = participants.filter(({ userId }) => userId !== "alice");
    expect(
      await fixture.db
        .select({ entityId: entityGrants.entityId, actorEntityId: entityGrants.actorEntityId })
        .from(entityGrants)
        .where(
          inArray(
            entityGrants.entityId,
            created.map(({ entityId }) => entityId),
          ),
        ),
    ).toEqual(
      expect.arrayContaining(
        created.map(({ entityId }) => ({ entityId, actorEntityId: entityId })),
      ),
    );
  }
  expect(counts[1]).toBe(counts[0]);
});

test("recipient normalization deduplicates emails and users without choosing an external organization", async () => {
  // Better Auth stores emails in lowercase, so only the input needs normalization.
  await fixture.db.update(user).set({ emailVerified: true });
  await fixture.db.insert(organization).values({ id: "org-0", name: "First", slug: "first" });
  await fixture.db.insert(member).values([
    { id: "bob-0", userId: "bob", organizationId: "org-0" },
    { id: "outsider-0", userId: "outsider", organizationId: "org-0" },
  ]);
  const { chat, lookups, parameters, queries } = recordedService();
  const group = await chat.createConversation({
    kind: "group",
    shareHistory: true,
    emails: [" BOB@example.com ", "bob@example.com", " ALICE@example.com ", "outside@example.com"],
  });
  expect(
    await fixture.db
      .select({
        userId: actors.userId,
        organizationId: messagingParticipants.organizationId,
      })
      .from(messagingParticipants)
      .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
      .where(eq(messagingParticipants.conversationId, group.id))
      .orderBy(actors.userId),
  ).toEqual([
    { userId: "alice", organizationId: fixture.orgA },
    { userId: "bob", organizationId: fixture.orgA },
  ]);
  expect(lookups()).toHaveLength(1);
  const lookupParameters = parameters[queries.indexOf(lookups()[0]!)];
  expect(lookupParameters?.filter((value) => value === "bob@example.com")).toHaveLength(1);
  expect(await chat.addMembers(group.id, ["bob@example.com", " BOB@example.com "])).toEqual({
    added: 0,
  });
  const sharing = createSharingService(fixture.db, {
    userId: "alice",
    organizationId: fixture.orgA,
  });
  const pending = (await sharing.list(group.id)).invitations[0]!;
  await createSharingService(fixture.db, {
    userId: "outsider",
    organizationId: fixture.orgB,
  }).accept(pending.id, true);
  expect(
    await rejection(
      createMessagingService(fixture.db, {
        userId: "outsider",
        organizationId: "org-0",
      }).listMessages(group.id),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test.each(["missing", "unverified", "no-membership"])(
  "%s recipients reject the entire operation",
  async (failure) => {
    await fixture.db.update(user).set({ emailVerified: true });
    if (failure === "unverified")
      await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "outsider"));
    if (failure === "no-membership")
      await fixture.db.delete(member).where(eq(member.userId, "outsider"));
    const { chat, lookups } = recordedService();
    const channel = await chat.createConversation({
      kind: "channel",
      name: "private",
      private: true,
    });
    const emails = [
      "bob@example.com",
      failure === "missing" ? "missing@example.com" : "outside@example.com",
    ];
    expect(await rejection(chat.createConversation({ kind: "group", emails }))).toBeInstanceOf(
      ValidationError,
    );
    expect(lookups()).toHaveLength(1);
    expect(await rejection(chat.addMembers(channel.id, emails))).toBeInstanceOf(ValidationError);
    expect(await fixture.db.select().from(messagingConversations)).toHaveLength(1);
    expect(await fixture.db.select().from(messagingParticipants)).toMatchObject([
      { actorEntityId: fixture.alice, actorType: "human" },
    ]);
  },
);

test("empty, invalid and oversized lists skip recipient lookup", async () => {
  await fixture.db.update(user).set({ emailVerified: true });
  const { chat, lookups } = recordedService();
  const channel = await chat.createConversation({ kind: "channel", name: "empty" });
  expect(await chat.addMembers(channel.id, [])).toEqual({ added: 0 });
  for (const emails of [
    ["bob@example.com", "invalid"],
    [" "],
    Array<string>(messagingLimits.recipients + 1).fill("bob@example.com"),
  ]) {
    expect(await rejection(chat.createConversation({ kind: "group", emails }))).toBeInstanceOf(
      ValidationError,
    );
    expect(await rejection(chat.addMembers(channel.id, emails))).toBeInstanceOf(ValidationError);
  }
  expect(lookups()).toEqual([]);
  expect(await fixture.db.select().from(messagingConversations)).toHaveLength(1);
  expect(await fixture.db.select().from(messagingParticipants)).toMatchObject([
    { actorEntityId: fixture.alice, actorType: "human" },
  ]);
});
