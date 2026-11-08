import { AccessDeniedError, ValidationError } from "../../errors";
import { member, organization, user } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { messagingConversations, messagingParticipants } from "./schema";
import { createMessagingService } from "./service";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();

function recordedService() {
  const recording = recordQueries();
  return {
    ...recording,
    chat: createMessagingService(recording.db, {
      userId: "alice",
      organizationId: fixture.orgA,
    }),
    lookups: () => recording.queries.filter((query) => query.includes('lower("user"."email")')),
  };
}

test("100 unique recipients use one lookup for creation and member addition", async () => {
  await fixture.db.update(user).set({ emailVerified: true });
  const recipients = Array.from({ length: 100 }, (_, index) => ({
    id: `recipient-${index}`,
    name: `Recipient ${index}`,
    email: `recipient-${index}@example.com`,
    emailVerified: true,
  }));
  await fixture.db.insert(user).values(recipients);
  await fixture.db
    .insert(member)
    .values(recipients.map(({ id }) => ({ id, userId: id, organizationId: fixture.orgB })));
  const { chat, queries, lookups } = recordedService();
  const group = await chat.createConversation({
    kind: "group",
    emails: recipients.map(({ email }) => email),
  });
  expect(
    await fixture.db
      .select({
        userId: messagingParticipants.userId,
        organizationId: messagingParticipants.organizationId,
      })
      .from(messagingParticipants)
      .where(eq(messagingParticipants.conversationId, group.id)),
  ).toEqual(
    expect.arrayContaining([
      { userId: "alice", organizationId: fixture.orgA },
      ...recipients.map(({ id }) => ({ userId: id, organizationId: fixture.orgB })),
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
    added: 100,
  });
  expect(lookups()).toHaveLength(1);
  expect(await chat.listMembers(group.id)).toHaveLength(101);
});

test("recipient normalization deduplicates emails and users, excludes sender and preserves membership preference", async () => {
  await fixture.db.update(user).set({ emailVerified: true });
  await fixture.db.update(user).set({ email: "BoB@example.com" }).where(eq(user.id, "bob"));
  await fixture.db.insert(organization).values({ id: "org-0", name: "First", slug: "first" });
  await fixture.db.insert(member).values([
    { id: "bob-0", userId: "bob", organizationId: "org-0" },
    { id: "outsider-0", userId: "outsider", organizationId: "org-0" },
  ]);
  const { chat, lookups, parameters, queries } = recordedService();
  const group = await chat.createConversation({
    kind: "group",
    emails: [" BOB@example.com ", "bob@example.com", " ALICE@example.com ", "outside@example.com"],
  });
  expect(
    await fixture.db
      .select({
        userId: messagingParticipants.userId,
        organizationId: messagingParticipants.organizationId,
      })
      .from(messagingParticipants)
      .where(eq(messagingParticipants.conversationId, group.id))
      .orderBy(messagingParticipants.userId),
  ).toEqual([
    { userId: "alice", organizationId: fixture.orgA },
    { userId: "bob", organizationId: fixture.orgA },
    { userId: "outsider", organizationId: "org-0" },
  ]);
  expect(lookups()).toHaveLength(1);
  const lookupParameters = parameters[queries.indexOf(lookups()[0]!)];
  expect(lookupParameters?.filter((value) => value === "bob@example.com")).toHaveLength(1);
  expect(await chat.addMembers(group.id, ["bob@example.com", " BOB@example.com "])).toEqual({
    added: 0,
  });
  await expect(
    createMessagingService(fixture.db, {
      userId: "outsider",
      organizationId: fixture.orgB,
    }).listMembers(group.id),
  ).rejects.toBeInstanceOf(AccessDeniedError);
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
    await expect(chat.createConversation({ kind: "group", emails })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(lookups()).toHaveLength(1);
    await expect(chat.addMembers(channel.id, emails)).rejects.toBeInstanceOf(ValidationError);
    expect(await fixture.db.select().from(messagingConversations)).toHaveLength(1);
    expect(await fixture.db.select().from(messagingParticipants)).toMatchObject([
      { userId: "alice" },
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
    Array<string>(101).fill("bob@example.com"),
  ]) {
    await expect(chat.createConversation({ kind: "group", emails })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(chat.addMembers(channel.id, emails)).rejects.toBeInstanceOf(ValidationError);
  }
  expect(lookups()).toEqual([]);
  expect(await fixture.db.select().from(messagingConversations)).toHaveLength(1);
  expect(await fixture.db.select().from(messagingParticipants)).toMatchObject([
    { userId: "alice" },
  ]);
});
