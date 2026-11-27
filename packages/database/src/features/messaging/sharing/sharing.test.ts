import { realtimeKeys } from "@substrate/contracts/realtime";

import { ensureUserAgentActor } from "../../../core/actors/provisioning";
import { userAgents } from "../../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../../core/executor";
import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import * as schema from "../../../schema";
import { member, user } from "../../../schema";
import { discardEffects } from "../../../testing/connection";
import { setupDatabase } from "../../../testing/database";
import { recordQueries } from "../../../testing/queries";
import { receivesChange } from "../../../testing/realtime";
import { rejection } from "../../../testing/rejection";
import { createContextService } from "../../context/service";
import { messagingParticipants } from "../schema";
import { createMessagingService } from "../service";
import { messagingConnections, messagingInvitations } from "../sharing.schema";
import { messagingSharingEvents } from "../sharing.schema";
import { claimSharingMail as claimCommittedSharingMail, clearMembershipSharing } from "./committed";
import { readSharingInvitation } from "./invitations";
import { claimSharingMail, finishSharingMail } from "./mail";
import { createSharingService } from "./service";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();
const host = () => createMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
const sharing = (userId = "alice", organizationId = f.orgA) =>
  createSharingService(f.db, { userId, organizationId });
async function channel() {
  await f.db.update(user).set({ emailVerified: true });
  return host().createConversation({ kind: "channel", name: "Partners", private: true });
}

test("membership cleanup uses one transaction, collects hints and rolls back on failure", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await sharing("outsider", f.orgB).accept(invite.id, true);
  const pending = await sharing("outsider", f.orgB).invite(c.id, {
    email: "bob@example.com",
    shareHistory: true,
  });
  const before = await f.db.select().from(messagingParticipants);
  const invitationsBefore = await f.db.select().from(messagingInvitations);
  const failure = new Error("Abort membership cleanup");
  let count = 0;
  let abort = true;
  const track = (db: DatabaseExecutor): DatabaseExecutor =>
    discardEffects(
      new Proxy(db, {
        get(target, property: keyof DatabaseExecutor) {
          if (property !== "transaction") return target[property];
          return <T>(work: (tx: DatabaseExecutor) => Promise<T>) => {
            count++;
            return target.transaction(async (tx) => {
              const result = await work(track(tx));
              if (abort) throw failure;
              return result;
            });
          };
        },
      }),
    );
  const db = track(f.db);
  expect(await rejection(clearMembershipSharing(db, "outsider", f.orgB))).toBe(failure);
  expect(count).toBe(1);
  expect(await f.db.select().from(messagingParticipants)).toEqual(before);
  expect(await f.db.select().from(messagingInvitations)).toEqual(invitationsBefore);
  count = 0;
  abort = false;
  const committed = await clearMembershipSharing(db, "outsider", f.orgB);
  expect(count).toBe(1);
  expect(committed.result).toBeNull();
  expect(committed.hints).toContainEqual({
    audience: realtimeKeys.user("outsider"),
    domain: "access",
  });
  const [removed] = await f.db
    .select()
    .from(messagingParticipants)
    .where(eq(messagingParticipants.actorEntityId, f.outsider));
  expect(removed!.consentedAt).toBeNull();
  expect(removed!.leftAt).not.toBeNull();
  const [revoked] = await f.db
    .select()
    .from(messagingInvitations)
    .where(eq(messagingInvitations.id, pending.id));
  expect(revoked!.status).toBe("revoked");
});

test("an organization invitation grants nothing before approval and only the invited participant afterwards", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const partner = createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB });
  expect(await rejection(partner.listMessages(c.id))).toBeInstanceOf(AccessDeniedError);
  await host().sendMessage(c.id, "Full history is explicitly shared");
  expect(await sharing("outsider", f.orgB).accept(invite.id, true)).toMatchObject({
    status: "accepted",
    conversationId: c.id,
  });
  expect(await partner.listMessages(c.id)).toMatchObject([
    { body: "Full history is explicitly shared" },
  ]);
  await f.db.insert(member).values({ id: "bob-b", userId: "bob", organizationId: f.orgB });
  expect(
    await rejection(
      createMessagingService(f.db, { userId: "bob", organizationId: f.orgB }).listMessages(c.id),
    ),
  ).toBeInstanceOf(AccessDeniedError);
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
  const [requested] = await f.db
    .select()
    .from(messagingInvitations)
    .where(eq(messagingInvitations.id, invite.id));
  expect(requested).toMatchObject({
    status: "pending",
    recipientUserId: "bob",
    targetOrganizationId: f.orgB,
  });
  expect(await f.db.select().from(messagingConnections)).toEqual([]);
  expect(
    await f.db
      .select()
      .from(messagingParticipants)
      .where(eq(messagingParticipants.organizationId, f.orgB)),
  ).toEqual([]);
  expect(
    await rejection(
      createMessagingService(f.db, { userId: "bob", organizationId: f.orgB }).listMessages(c.id),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  await sharing("outsider", f.orgB).accept(invite.id, true);
  expect(
    await createMessagingService(f.db, { userId: "bob", organizationId: f.orgB }).listMessages(
      c.id,
    ),
  ).toEqual([]);
  expect(
    await rejection(
      createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB }).listMessages(
        c.id,
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test("legacy participants require individual reapproval even after their org connects", async () => {
  const c = await channel();
  await f.db.insert(messagingParticipants).values({
    conversationId: c.id,
    organizationId: f.orgB,
    actorEntityId: f.outsider,
    actorType: "human",
  });
  expect(
    await rejection(
      createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB }).listMessages(
        c.id,
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
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
  expect(await rejection(partner.listMessages(c.id))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(partner.sendMessage(c.id, "Not allowed"))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(sharing("outsider", f.orgB).accept(invite.id, true))).toBeInstanceOf(
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
  const declined = await sharing("outsider", f.orgB).invite(c.id, {
    email: "bob@example.com",
    shareHistory: true,
  });
  await sharing("bob", f.orgB).decline(declined.id);
  const revoked = await sharing("outsider", f.orgB).invite(c.id, {
    email: "bob@example.com",
    shareHistory: true,
  });
  await sharing("outsider", f.orgB).revoke(revoked.id);
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
    [declined.id]: "declined",
    [revoked.id]: "revoked",
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
  expect(await rejection(host().addMembers(c.id, emails, true))).toBeInstanceOf(ValidationError);
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
  const invite = await (
    await f.forSession("alice")
  ).sharing.invite(c.id, { email: "outside@example.com", shareHistory: true });
  const host = { audience: realtimeKeys.organization(f.orgA), domain: "access" as const };
  const people = [
    { audience: realtimeKeys.user("alice"), domain: "access" as const },
    { audience: realtimeKeys.user("outsider"), domain: "access" as const },
  ];
  expect(invite.hints).toEqual([host, ...people]);
  expect(
    (await (await f.forSession("outsider", f.orgB)).sharing.accept(invite.result.id, true)).hints,
  ).toEqual([host, { audience: realtimeKeys.organization(f.orgB), domain: "access" }, ...people]);
});

test("invites are email-bound, expire, and can be revoked", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  expect(await rejection(sharing("bob").accept(invite.id, true))).toBeInstanceOf(AccessDeniedError);
  await f.db
    .update(messagingInvitations)
    .set({ expiresAt: new Date(0) })
    .where(eq(messagingInvitations.id, invite.id));
  expect(await rejection(sharing("outsider", f.orgB).accept(invite.id, true))).toBeInstanceOf(
    ValidationError,
  );
  const [expired] = await f.db
    .select()
    .from(messagingInvitations)
    .where(eq(messagingInvitations.id, invite.id));
  expect(expired!.status).toBe("pending");
  const next = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await sharing().revoke(next.id);
  expect(await rejection(sharing("outsider", f.orgB).accept(next.id, true))).toBeInstanceOf(
    ValidationError,
  );
});

test("channel sharing requires current admin authority on both sides and a history warning", async () => {
  const c = await channel();
  expect(
    await rejection(
      sharing("bob").invite(c.id, { email: "outside@example.com", shareHistory: true }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(sharing().invite(c.id, { email: "outside@example.com", shareHistory: false })),
  ).toBeInstanceOf(ValidationError);
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  expect(await rejection(sharing("outsider", f.orgB).accept(invite.id, true))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("concurrent acceptance leaves one participant and one approval event", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const results = await Promise.allSettled([
    sharing("outsider", f.orgB).accept(invite.id, true),
    sharing("outsider", f.orgB).accept(invite.id, true),
  ]);
  // One call accepts. The other replays it, or loses the conversation claim and can retry.
  const accepted = results.filter((result) => result.status === "fulfilled");
  expect(accepted.length).toBeGreaterThanOrEqual(1);
  for (const result of results)
    if (result.status === "fulfilled") expect(result.value.status).toBe("accepted");
    else expect(result.reason).toBeInstanceOf(ConflictError);
  expect(await sharing("outsider", f.orgB).accept(invite.id, true)).toMatchObject({
    status: "accepted",
  });
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

test("accept and decline racing on one invitation commit exactly one outcome", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const results = await Promise.allSettled([
    sharing("outsider", f.orgB).accept(invite.id, true),
    sharing("outsider", f.orgB).decline(invite.id),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const loser = results.find((result) => result.status === "rejected");
  expect(loser?.status === "rejected" ? loser.reason : undefined).toBeInstanceOf(ValidationError);
  const [current] = await f.db
    .select()
    .from(messagingInvitations)
    .where(eq(messagingInvitations.id, invite.id));
  const accepted = results[0]!.status === "fulfilled";
  expect(current!.status).toBe(accepted ? "accepted" : "declined");
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
  ).toHaveLength(accepted ? 1 : 0);
  expect(
    await f.db
      .select()
      .from(messagingConnections)
      .where(
        and(
          eq(messagingConnections.conversationId, c.id),
          eq(messagingConnections.organizationId, f.orgB),
        ),
      ),
  ).toHaveLength(accepted ? 1 : 0);
  expect(
    await f.db
      .select()
      .from(messagingSharingEvents)
      .where(
        and(
          eq(messagingSharingEvents.invitationId, invite.id),
          eq(messagingSharingEvents.action, accepted ? "accepted" : "declined"),
        ),
      ),
  ).toHaveLength(1);
});

test("resending invalidates the previous invitation and revocation is permanent for that link", async () => {
  const c = await channel();
  const old = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const fresh = await sharing().resend(old.id);
  expect(fresh.id).not.toBe(old.id);
  expect(await rejection(sharing("outsider", f.orgB).accept(old.id, true))).toBeInstanceOf(
    ValidationError,
  );
  await sharing().revoke(fresh.id);
  expect(await rejection(sharing("outsider", f.orgB).accept(fresh.id, true))).toBeInstanceOf(
    ValidationError,
  );
});

test("terminal invitation outcomes survive actions, replacement and membership cleanup", async () => {
  const c = await channel();
  const accepted = await sharing().invite(c.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  await sharing("outsider", f.orgB).accept(accepted.id, true);
  const declined = await sharing().invite(c.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  await sharing("outsider", f.orgB).decline(declined.id);
  const revoked = await sharing().invite(c.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  await sharing().revoke(revoked.id);
  const pending = await sharing().invite(c.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  for (const invite of [accepted, declined, revoked]) {
    expect(await rejection(sharing().revoke(invite.id))).toBeInstanceOf(ValidationError);
    expect(await rejection(sharing("outsider", f.orgB).decline(invite.id))).toBeInstanceOf(
      ValidationError,
    );
  }
  for (const invite of [declined, revoked])
    expect(await rejection(sharing("outsider", f.orgB).accept(invite.id, true))).toBeInstanceOf(
      ValidationError,
    );
  await clearMembershipSharing(f.db, "alice", f.orgA);
  const statuses = Object.fromEntries(
    (await f.db.select().from(messagingInvitations)).map((row) => [row.id, row.status]),
  );
  expect(statuses).toEqual({
    [accepted.id]: "accepted",
    [declined.id]: "declined",
    [revoked.id]: "revoked",
    [pending.id]: "revoked",
  });
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
    .values({
      userId: "outsider",
      name: "Partner helper",
      avatarCode: "100000",
      harness: "opencode",
      instructions: "",
    })
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
  expect(await rejection(agentChat.listMessages(c.id))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(context.messageTarget(c.id, message.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection(createMessagingService(f.db, identity).getProfile(c.id, f.alice)),
  ).toBeInstanceOf(AccessDeniedError);
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
  expect(
    await rejection(
      createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB }).listMessages(
        c.id,
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
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
  expect(
    await rejection(
      createMessagingService(f.db, { userId: "bob", organizationId: f.orgA }).listMessages(c.id),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(sharing("outsider", f.orgB).disconnect(c.id, f.orgA))).toBeInstanceOf(
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
  expect(await rejection(readSharingInvitation(f.db, "replacement", invite.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await sharing("replacement", f.orgB).inbox()).toEqual([]);
  expect(await readSharingInvitation(f.db, "bob", invite.id)).toMatchObject({
    id: invite.id,
    status: "pending",
  });
  await sharing("outsider", f.orgB).accept(invite.id, true);
  expect(
    await rejection(
      createMessagingService(f.db, { userId: "replacement", organizationId: f.orgB }).listMessages(
        c.id,
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
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
  await rejection(insertForgedReference());
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

test("mail is durable, leased once, retried after failure, and skipped after revocation", async () => {
  const c = await channel();
  const invite = await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true });
  const { db, queries } = recordQueries();
  const { result: first, hints } = await claimCommittedSharingMail(db);
  expect(hints).toEqual([]);
  expect(first).toMatchObject({
    id: invite.id,
    email: "outside@example.com",
    attempt: 1,
    name: c.name,
    organizationName: "A",
  });
  expect(queries).toHaveLength(1);
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

test("concurrent mail workers lease an invitation only once with one atomic statement", async () => {
  const c = await channel();
  const invitation = await sharing().invite(c.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  const claims = await Promise.all([claimSharingMail(f.db), claimSharingMail(f.db)]);
  expect(claims.filter((claim) => claim !== null)).toMatchObject([
    { id: invitation.id, attempt: 1 },
  ]);
  const [stored] = await f.db
    .select()
    .from(messagingInvitations)
    .where(eq(messagingInvitations.id, invitation.id));
  expect(stored?.deliveryAttempts).toBe(1);
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
  expect(await rejection(partner.listMessages(dm.id))).toBeInstanceOf(AccessDeniedError);
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
  expect(await rejection(partner.listMessages(group.id))).toBeInstanceOf(AccessDeniedError);
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

test("the sharing list names each conversation and tags its partner and status for admins of both sides", async () => {
  const connected = await channel();
  await sharing("outsider", f.orgB).accept(
    (await sharing().invite(connected.id, { email: "outside@example.com", shareHistory: true })).id,
    true,
  );
  const invited = await host().createConversation({ kind: "channel", name: "Invited" });
  await sharing().invite(invited.id, { email: "outside@example.com", shareHistory: true });
  const requested = await host().createConversation({ kind: "channel", name: "Requested" });
  await f.db.insert(member).values({ id: "bob-b", userId: "bob", organizationId: f.orgB });
  const request = await sharing().invite(requested.id, {
    email: "bob@example.com",
    shareHistory: true,
  });
  expect((await sharing("bob", f.orgB).accept(request.id, true)).status).toBe("approval-required");
  const unshared = await host().createConversation({ kind: "channel", name: "Internal" });
  const rows = new Map((await sharing().listConversations()).map((row) => [row.id, row]));
  expect(rows.get(connected.id)).toMatchObject({
    kind: "channel",
    displayName: "Partners",
    accessible: true,
    partnerOrganizationName: "B",
    partnerOrganizationCount: 1,
    participantCount: 2,
    status: "connected",
  });
  expect(rows.get(invited.id)).toMatchObject({
    displayName: "Invited",
    partnerOrganizationName: null,
    partnerOrganizationCount: 0,
    status: "invited",
  });
  expect(rows.get(requested.id)).toMatchObject({
    partnerOrganizationName: null,
    status: "needs-approval",
  });
  expect(rows.get(unshared.id)).toMatchObject({ status: null, partnerOrganizationName: null });
  expect(await sharing("outsider", f.orgB).listConversations()).toMatchObject([
    {
      id: connected.id,
      displayName: "Partners",
      partnerOrganizationName: "A",
      partnerOrganizationCount: 1,
      status: "connected",
    },
  ]);
});

test("a partner person who must accept again marks the row as needing approval", async () => {
  const c = await channel();
  await sharing("outsider", f.orgB).accept(
    (await sharing().invite(c.id, { email: "outside@example.com", shareHistory: true })).id,
    true,
  );
  await f.db
    .update(messagingParticipants)
    .set({ consentedAt: null })
    .where(eq(messagingParticipants.actorEntityId, f.outsider));
  expect((await sharing().listConversations())[0]).toMatchObject({ status: "needs-approval" });
  expect((await sharing("outsider", f.orgB).listConversations())[0]).toMatchObject({
    status: "needs-approval",
  });
});

test("the sharing list hides participant names and counts of conversations the viewer cannot open", async () => {
  await f.db.update(user).set({ emailVerified: true });
  await f.db
    .insert(user)
    .values({ id: "pat", name: "Pat", email: "pat@example.com", emailVerified: true });
  await f.db.insert(member).values({ id: "pat-b", userId: "pat", organizationId: f.orgB });
  const group = await host().createConversation({
    kind: "group",
    emails: ["bob@example.com", "pat@example.com"],
    shareHistory: true,
  });
  const [invite] = await f.db
    .select()
    .from(messagingInvitations)
    .where(eq(messagingInvitations.conversationId, group.id));
  await sharing("pat", f.orgB).accept(invite!.id, true);
  const [hidden] = await sharing("outsider", f.orgB).listConversations();
  expect(hidden).toMatchObject({
    id: group.id,
    kind: "group",
    displayName: null,
    accessible: false,
    participantCount: null,
    partnerOrganizationName: "A",
    status: "connected",
  });
  expect(JSON.stringify(hidden)).not.toMatch(/Alice|Bob|Pat/);
  expect((await sharing().listConversations())[0]).toMatchObject({
    displayName: "Bob, Pat",
    accessible: true,
    participantCount: 3,
    partnerOrganizationName: "B",
  });
});
