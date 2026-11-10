import { realtimeKeys } from "@startup-os/contracts/realtime";

import { ensureUserAgentActor } from "../../../core/actors/provisioning";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { AccessDeniedError, ValidationError } from "../../../errors";
import * as schema from "../../../schema";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { member, user } from "../../../schema";
import { setupDatabase } from "../../../testing/database";
import { receivesChange } from "../../../testing/realtime";
import { createContextService } from "../../context/service";
import { messagingParticipants } from "../schema";
import { createMessagingService } from "../service";
import { messagingConnections, messagingInvitations } from "../sharing.schema";
import { messagingSharingEvents } from "../sharing.schema";
import { clearMembershipSharing } from "./connections";
import { readSharingInvitation } from "./invitations";
import { claimSharingMail, finishSharingMail } from "./mail";
import { createSharingService } from "./service";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

const f = setupDatabase();
const host = () => createMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
const sharing = (userId = "alice", organizationId = f.orgA) =>
  createSharingService(f.db, { userId, organizationId });
async function channel() {
  await f.db.update(user).set({ emailVerified: true });
  return host().createConversation({ kind: "channel", name: "Partners", private: true });
}

test("an organization invitation grants nothing before approval and only the invited participant afterwards", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const partner = createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB });
  await expect(partner.listMessages(c.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await host().sendMessage(c.id, "Full history is explicitly shared");
  expect(await sharing("outsider", f.orgB).accept(invite.id, true)).toMatchObject({
    status: "accepted",
    conversationId: c.id,
  });
  expect(await partner.listMessages(c.id)).toMatchObject([
    { body: "Full history is explicitly shared" },
  ]);
  await f.db.insert(member).values({ id: "bob-b", userId: "bob", organizationId: f.orgB });
  await expect(
    createMessagingService(f.db, { userId: "bob", organizationId: f.orgB }).listMessages(c.id),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});

test("listed members mark people from another organization as external for each viewer", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await sharing("outsider", f.orgB).accept(invite.id, true);
  const external = async (userId: string, organizationId: string) =>
    Object.fromEntries(
      (
        await createMessagingService(f.db, { userId, organizationId }).listConversations()
      )[0]!.members.map((person) => [person.userId, person.external]),
    );
  expect(await external("alice", f.orgA)).toEqual({ alice: false, outsider: true });
  expect(await external("outsider", f.orgB)).toEqual({ alice: true, outsider: false });
});

test("channel readers see the host and all active partner organizations, but not pending or disconnected ones", async () => {
  const c = await channel();
  await f.db.insert(schema.organization).values({ id: "org-c", name: "C", slug: "c" });
  await f.db
    .insert(member)
    .values({ id: "bob-c", userId: "bob", organizationId: "org-c", role: "owner" });
  const first = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const second = await sharing().invite(c.id, { email: "bob@example.com", shareHistory: true });
  expect((await host().listConversations())[0]!.organizations).toEqual([
    { id: f.orgA, name: "A", host: true, own: true },
  ]);
  await sharing("outsider", f.orgB).accept(first.id, true);
  await sharing("bob", "org-c").accept(second.id, true);
  const partner = createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB });
  const [row] = await partner.listConversations();
  expect(row!.organizations).toEqual([
    { id: f.orgA, name: "A", host: true, own: false },
    { id: f.orgB, name: "B", host: false, own: true },
    { id: "org-c", name: "C", host: false, own: false },
  ]);
  expect(row!.members).toEqual(
    expect.arrayContaining([expect.objectContaining({ userId: "bob", organizationId: "org-c" })]),
  );
  expect(
    await createMessagingService(f.db, {
      userId: "bob",
      organizationId: f.orgA,
    }).listConversations(),
  ).toEqual([]);
  await sharing().disconnect(c.id, "org-c");
  expect((await partner.listConversations())[0]!.organizations.map((org) => org.id)).toEqual([
    f.orgA,
    f.orgB,
  ]);
  await sharing().disconnect(c.id, f.orgB);
  expect(await partner.listConversations()).toEqual([]);
});

test("ordinary recipients request approval instead of granting access to their org", async () => {
  const c = await channel();
  await f.db.insert(member).values({ id: "bob-b", userId: "bob", organizationId: f.orgB });
  const invite = await sharing().invite(c.id, { email: "bob@example.com", shareHistory: true });
  expect(await sharing("bob", f.orgB).accept(invite.id, true)).toMatchObject({
    status: "approval-required",
  });
  await expect(
    createMessagingService(f.db, { userId: "bob", organizationId: f.orgB }).listMessages(c.id),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await sharing("outsider", f.orgB).accept(invite.id, true);
  expect(
    await createMessagingService(f.db, { userId: "bob", organizationId: f.orgB }).listMessages(
      c.id,
    ),
  ).toEqual([]);
  await expect(
    createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB }).listMessages(c.id),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});

test("legacy participants require individual reapproval even after their org connects", async () => {
  const c = await channel();
  await f.db.insert(messagingParticipants).values({
    conversationId: c.id,
    organizationId: f.orgB,
    actorEntityId: f.outsider,
    actorType: "human",
  });
  await expect(
    createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB }).listMessages(c.id),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await sharing("outsider", f.orgB).accept(invite.id, true);
  expect(
    await createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB }).listMessages(
      c.id,
    ),
  ).toEqual([]);
});

test("disconnection revokes access and old accepted links cannot reconnect", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await sharing("outsider", f.orgB).accept(invite.id, true);
  await sharing("outsider", f.orgB).disconnect(c.id, f.orgB);
  const partner = createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB });
  await expect(partner.listMessages(c.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(partner.sendMessage(c.id, "Not allowed")).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(sharing("outsider", f.orgB).accept(invite.id, true)).rejects.toBeInstanceOf(
    ValidationError,
  );
});

test("disconnecting a partner revokes only invitations that concern that partner", async () => {
  const c = await channel();
  const initial = await sharing().invite(c.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  await sharing("outsider", f.orgB).accept(initial.id, true);
  await f.db.insert(member).values({ id: "bob-b", userId: "bob", organizationId: f.orgB });
  const sentByPartner = await sharing("outsider", f.orgB).invite(c.id, {
    email: "carol@example.test",
    shareHistory: true,
  });
  const awaitingApproval = await sharing().invite(c.id, {
    email: "bob@example.com",
    shareHistory: true,
  });
  await sharing("bob", f.orgB).accept(awaitingApproval.id, true);
  const unrelated = await sharing().invite(c.id, { email: "dan@example.test", shareHistory: true });
  await sharing().disconnect(c.id, f.orgB);
  const statuses = Object.fromEntries(
    (
      await f.db
        .select({ id: messagingInvitations.id, status: messagingInvitations.status })
        .from(messagingInvitations)
        .where(eq(messagingInvitations.conversationId, c.id))
    ).map((row) => [row.id, row.status]),
  );
  expect(statuses).toEqual({
    [initial.id]: "accepted",
    [sentByPartner.id]: "revoked",
    [awaitingApproval.id]: "revoked",
    [unrelated.id]: "pending",
  });
});

test("the pending invitation limit applies to the whole batch", async () => {
  const c = await channel();
  await f.db.insert(messagingInvitations).values(
    Array.from({ length: 98 }, (_, index) => ({
      conversationId: c.id,
      hostOrganizationId: f.orgA,
      senderOrganizationId: f.orgA,
      inviterId: "alice",
      email: `pending-${index}@example.test`,
      purpose: "organization" as const,
      createdAt: new Date(Date.now() - 7_200_000),
      expiresAt: new Date(Date.now() + 86_400_000),
    })),
  );
  const emails = ["one@example.test", "two@example.test", "three@example.test"];
  await expect(host().addMembers(c.id, emails, true)).rejects.toBeInstanceOf(ValidationError);
  expect(await f.db.select().from(messagingInvitations)).toHaveLength(98);
  expect(await host().addMembers(c.id, emails.slice(0, 2), true)).toEqual({
    added: 0,
    invited: 2,
  });
  expect(
    await f.db
      .select()
      .from(messagingSharingEvents)
      .where(eq(messagingSharingEvents.action, "invited")),
  ).toHaveLength(2);
});

test("invitation changes return hints for both organizations and both people", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const host = { audience: realtimeKeys.organization(f.orgA), domain: "access" as const };
  const people = [
    { audience: realtimeKeys.user("alice"), domain: "access" as const },
    { audience: realtimeKeys.user("outsider"), domain: "access" as const },
  ];
  expect(invite.hints).toEqual([host, ...people]);
  expect((await sharing("outsider", f.orgB).accept(invite.id, true)).hints).toEqual([
    host,
    { audience: realtimeKeys.organization(f.orgB), domain: "access" },
    ...people,
  ]);
});

test("invites are email-bound, expire, and can be revoked", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await expect(sharing("bob").accept(invite.id, true)).rejects.toBeInstanceOf(AccessDeniedError);
  await f.db
    .update(messagingInvitations)
    .set({ expiresAt: new Date(0) })
    .where(eq(messagingInvitations.id, invite.id));
  await expect(sharing("outsider", f.orgB).accept(invite.id, true)).rejects.toBeInstanceOf(
    ValidationError,
  );
  const next = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await sharing().revoke(next.id);
  await expect(sharing("outsider", f.orgB).accept(next.id, true)).rejects.toBeInstanceOf(
    ValidationError,
  );
});

test("channel sharing requires current admin authority on both sides and a history warning", async () => {
  const c = await channel();
  await expect(
    sharing("bob").invite(c.id, { email: "outside@example.com", shareHistory: true }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    sharing().invite(c.id, { email: "outside@example.com", shareHistory: false }),
  ).rejects.toBeInstanceOf(ValidationError);
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  await expect(sharing("outsider", f.orgB).accept(invite.id, true)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("concurrent acceptance is safe to replay without duplicate participants or approval events", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const results = await Promise.all([
    sharing("outsider", f.orgB).accept(invite.id, true),
    sharing("outsider", f.orgB).accept(invite.id, true),
  ]);
  expect(results.map((result) => result.status)).toEqual(["accepted", "accepted"]);
  expect(
    await f.db
      .select()
      .from(messagingParticipants)
      .where(
        and(
          eq(messagingParticipants.conversationId, c.id),
          eq(messagingParticipants.organizationId, f.orgB),
        ),
      ),
  ).toHaveLength(1);
  expect(
    await f.db
      .select()
      .from(messagingSharingEvents)
      .where(
        and(
          eq(messagingSharingEvents.invitationId, invite.id),
          eq(messagingSharingEvents.action, "accepted"),
        ),
      ),
  ).toHaveLength(1);
});

test("resending invalidates the previous invitation and revocation is permanent for that link", async () => {
  const c = await channel();
  const old = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const fresh = await sharing().resend(old.id);
  expect(fresh.id).not.toBe(old.id);
  await expect(sharing("outsider", f.orgB).accept(old.id, true)).rejects.toBeInstanceOf(
    ValidationError,
  );
  await sharing().revoke(fresh.id);
  await expect(sharing("outsider", f.orgB).accept(fresh.id, true)).rejects.toBeInstanceOf(
    ValidationError,
  );
});

test("disconnect removes search, profiles, realtime and owner-based agent reads", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await sharing("outsider", f.orgB).accept(invite.id, true);
  const message = await host().sendMessage(c.id, "Searchable shared history");
  const identity = { userId: "outsider", organizationId: f.orgB };
  const context = createContextService(f.db, identity);
  const [definition] = await f.db
    .insert(userAgents)
    .values({ userId: "outsider", name: "Partner helper", harness: "opencode", instructions: "" })
    .returning();
  const agent = await ensureUserAgentActor(f.db, { ...identity, userAgentId: definition!.id });
  const agentChat = createMessagingService(f.db, { ...identity, actorEntityId: agent.entityId });
  await createMessagingService(f.db, identity).addAgent(c.id, definition!.id);
  expect((await host().listConversations())[0]!.members).toEqual(
    expect.arrayContaining([expect.objectContaining({ actorId: agent.entityId })]),
  );
  expect(await context.search({ query: "Searchable", kind: "message" })).toHaveLength(1);
  expect(await agentChat.listMessages(c.id)).toHaveLength(1);
  expect((await agentChat.listConversations())[0]!.canShare).toBe(false);
  expect(await receivesChange(f.db, identity, realtimeKeys.conversation(c.id))).toBe(true);
  await sharing().disconnect(c.id, f.orgB);
  expect(await context.search({ query: "Searchable", kind: "message" })).toEqual([]);
  expect(await receivesChange(f.db, identity, realtimeKeys.conversation(c.id))).toBe(false);
  await expect(agentChat.listMessages(c.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(context.messageTarget(c.id, message.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    createMessagingService(f.db, identity).getProfile(c.id, f.alice),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await host().listMessages(c.id)).toHaveLength(1);
});

test("leaving and rejoining an organization does not restore earlier external consent", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await sharing("outsider", f.orgB).accept(invite.id, true);
  const [participant] = await f.db
    .select()
    .from(messagingParticipants)
    .where(eq(messagingParticipants.actorEntityId, f.outsider));
  await f.db.delete(member).where(eq(member.userId, "outsider"));
  await f.db.insert(member).values({
    id: "outsider-rejoined",
    userId: "outsider",
    organizationId: f.orgB,
    role: "owner",
    createdAt: new Date(participant!.consentedAt!.getTime() + 1),
  });
  await expect(
    createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB }).listMessages(c.id),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  expect(
    await receivesChange(
      f.db,
      { userId: "outsider", organizationId: f.orgB },
      realtimeKeys.conversation(c.id),
    ),
  ).toBe(false);
  await clearMembershipSharing(f.db, "outsider", f.orgB);
  const [removed] = await f.db
    .select()
    .from(messagingParticipants)
    .where(eq(messagingParticipants.actorEntityId, f.outsider));
  expect(removed!.consentedAt).toBeNull();
  expect(removed!.leftAt).not.toBeNull();
});

test("a partner manager invites only into their approved org and cannot manage another org", async () => {
  const c = await channel();
  const initial = await sharing().invite(c.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  await sharing("outsider", f.orgB).accept(initial.id, true);
  await f.db.insert(member).values({ id: "bob-b", userId: "bob", organizationId: f.orgB });
  const invite = await sharing("outsider", f.orgB).invite(c.id, {
    email: "bob@example.com",
    shareHistory: true,
  });
  expect(await sharing("bob", f.orgB).accept(invite.id, true)).toMatchObject({
    status: "accepted",
  });
  const [connection] = await f.db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.conversationId, c.id));
  expect(connection!.approvedBy).toBe("outsider");
  expect(
    await createMessagingService(f.db, { userId: "bob", organizationId: f.orgB }).listMessages(
      c.id,
    ),
  ).toEqual([]);
  await expect(
    createMessagingService(f.db, { userId: "bob", organizationId: f.orgA }).listMessages(c.id),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(sharing("outsider", f.orgB).disconnect(c.id, f.orgA)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("an approval request stays bound to the original user when an email address changes owners", async () => {
  const c = await channel();
  await f.db.insert(member).values({ id: "bob-b", userId: "bob", organizationId: f.orgB });
  const invite = await sharing().invite(c.id, { email: "bob@example.com", shareHistory: true });
  await sharing("bob", f.orgB).accept(invite.id, true);
  await f.db.update(user).set({ email: "bob-new@example.com" }).where(eq(user.id, "bob"));
  await f.db.insert(user).values({
    id: "replacement",
    name: "Replacement",
    email: "bob@example.com",
    emailVerified: true,
  });
  await f.db
    .insert(member)
    .values({ id: "replacement-b", userId: "replacement", organizationId: f.orgB });
  await expect(readSharingInvitation(f.db, "replacement", invite.id)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await sharing("replacement", f.orgB).inbox()).toEqual([]);
  expect(await readSharingInvitation(f.db, "bob", invite.id)).toMatchObject({
    id: invite.id,
    status: "pending",
  });
  await sharing("outsider", f.orgB).accept(invite.id, true);
  await expect(
    createMessagingService(f.db, { userId: "replacement", organizationId: f.orgB }).listMessages(
      c.id,
    ),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});

test("invitation references cannot claim a different host organization", async () => {
  const c = await channel();
  const insertForgedReference = async () => {
    await f.db.insert(messagingInvitations).values({
      conversationId: c.id,
      hostOrganizationId: f.orgB,
      senderOrganizationId: f.orgA,
      inviterId: "alice",
      email: "forged@example.test",
      purpose: "organization",
      expiresAt: new Date(Date.now() + 60_000),
    });
  };
  await expect(insertForgedReference()).rejects.toThrow();
  expect(await f.db.select().from(messagingInvitations)).toEqual([]);
});

test("a legacy external owner can leave without changing the host organization's ownership", async () => {
  const c = await channel();
  const invitation = await sharing().invite(c.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  await sharing("outsider", f.orgB).accept(invitation.id, true);
  await f.db
    .update(schema.messagingConversations)
    .set({ createdBy: "outsider" })
    .where(eq(schema.messagingConversations.id, c.id));
  const partner = createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB });
  expect((await partner.listConversations())[0]!.canManage).toBe(false);
  expect(await partner.leaveConversation(c.id, "bob")).toEqual({ left: true });
  const [conversation] = await f.db
    .select()
    .from(schema.messagingConversations)
    .where(eq(schema.messagingConversations.id, c.id));
  expect(conversation!.createdBy).toBe("outsider");
  await host().transferOwnership(c.id, "alice");
  expect((await host().listConversations())[0]!.createdBy).toBe("alice");
});

test("a post waiting for a disconnect lock rechecks access after that disconnect commits", async () => {
  const c = await channel();
  const invitation = await sharing().invite(c.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  await sharing("outsider", f.orgB).accept(invitation.id, true);
  const tryingToPost = Promise.withResolvers<void>();
  const observed = drizzle(f.db.$client, {
    schema,
    logger: {
      logQuery: (query) => {
        if (query.includes("for share")) tryingToPost.resolve();
      },
    },
  });
  let settled = false;
  const outcome = await f.db.transaction(async (tx) => {
    await tx
      .select()
      .from(schema.messagingConversations)
      .where(eq(schema.messagingConversations.id, c.id))
      .for("update");
    const posted = createMessagingService(observed, { userId: "outsider", organizationId: f.orgB })
      .sendMessage(c.id, "Must not commit")
      .then(
        () => ({ error: null }),
        (error: Error) => ({ error }),
      )
      .finally(() => {
        settled = true;
      });
    await tryingToPost.promise;
    await createSharingService(tx, { userId: "alice", organizationId: f.orgA }).disconnect(
      c.id,
      f.orgB,
    );
    expect(settled).toBe(false);
    return { posted };
  });
  expect((await outcome.posted).error).toBeInstanceOf(AccessDeniedError);
  expect(await host().listMessages(c.id)).toEqual([]);
});

test("listing sharing does not wait for an open post", async () => {
  const c = await channel();
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const open = f.db.transaction(async (tx) => {
    await createMessagingService(tx, { userId: "alice", organizationId: f.orgA }).sendMessage(
      c.id,
      "open",
    );
    held.resolve();
    await release.promise;
  });
  try {
    await held.promise;
    const outcome = await Promise.race([
      sharing().list(c.id),
      Bun.sleep(1_000).then(() => "blocked" as const),
    ]);
    expect(outcome).toMatchObject({ host: true, kind: "channel" });
  } finally {
    release.resolve();
    await open;
  }
});

test("mail is durable, leased once, retried after failure, and skipped after revocation", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const first = await claimSharingMail(f.db);
  expect(first).toMatchObject({ id: invite.id, email: "outside@example.com", attempt: 1 });
  expect(await claimSharingMail(f.db)).toBeNull();
  await finishSharingMail(f.db, invite.id, 1, false);
  expect(await claimSharingMail(f.db)).toBeNull();
  await f.db
    .update(messagingInvitations)
    .set({ nextDeliveryAt: new Date(0) })
    .where(eq(messagingInvitations.id, invite.id));
  expect(await claimSharingMail(f.db)).toMatchObject({ id: invite.id, attempt: 2 });
  await finishSharingMail(f.db, invite.id, 2, true);
  expect(await claimSharingMail(f.db)).toBeNull();
  const revoked = await sharing().invite(c.id, {
    email: "another@example.test",
    shareHistory: true,
  });
  await sharing().revoke(revoked.id);
  expect(await claimSharingMail(f.db)).toBeNull();
});

test("external DMs and groups require individual consent but not an organization admin", async () => {
  await f.db.update(user).set({ emailVerified: true });
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "outsider"));
  const dm = await host().createConversation({
    kind: "dm",
    emails: ["outside@example.com"],
    shareHistory: true,
  });
  const partner = createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB });
  await expect(partner.listMessages(dm.id)).rejects.toBeInstanceOf(AccessDeniedError);
  const [invite] = await f.db
    .select()
    .from(messagingInvitations)
    .where(eq(messagingInvitations.conversationId, dm.id));
  expect(await sharing("outsider", f.orgB).accept(invite!.id, true)).toMatchObject({
    status: "accepted",
  });
  expect(await partner.listMessages(dm.id)).toEqual([]);
  expect(
    (await partner.listConversations()).find((conversation) => conversation.id === dm.id)!.canShare,
  ).toBe(true);
  const group = await host().createConversation({
    kind: "group",
    emails: ["bob@example.com", "outside@example.com"],
    shareHistory: true,
  });
  await expect(partner.listMessages(group.id)).rejects.toBeInstanceOf(AccessDeniedError);
  const [groupInvite] = await f.db
    .select()
    .from(messagingInvitations)
    .where(eq(messagingInvitations.conversationId, group.id));
  await sharing("outsider", f.orgB).accept(groupInvite!.id, true);
  expect(await partner.listMessages(group.id)).toEqual([]);
  expect(
    (await partner.listConversations()).find((conversation) => conversation.id === group.id)!
      .canShare,
  ).toBe(false);
  const internal = await host().createConversation({ kind: "dm", emails: ["bob@example.com"] });
  expect(
    (
      await createMessagingService(f.db, {
        userId: "bob",
        organizationId: f.orgA,
      }).listConversations()
    ).find((conversation) => conversation.id === internal.id)!.canShare,
  ).toBe(false);
});
