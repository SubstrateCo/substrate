import { sharingInviteInput } from "@substrate/contracts/messaging/sharing";

import type { DatabaseExecutor } from "../../../client";
import { ensureHumanActor } from "../../../core/actors/provisioning";
import { actors } from "../../../core/actors/schema";
import { user } from "../../../core/authentication/schema";
import { member, organization } from "../../../core/organizations/schema";
import { workspaceContext } from "../../../core/session/workspace";
import { AccessDeniedError, ValidationError } from "../../../errors";
import { sharingInvitationHints } from "../../realtime/routing";
import { lockConversation, visibleConversations, type Conversation } from "../access";
import { writeMembers } from "../members";
import { canShare, invitationTarget, validateExternalInvitations, type Viewer } from "../policy";
import { messagingConversations, messagingParticipants } from "../schema";
import { messagingConnections, messagingInvitations } from "../sharing.schema";
import {
  hasSharingConnection,
  requireSharingManager,
  requireSharingRecipient,
  recordSharingEvents,
} from "./access";
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";

/**
 * Queues invitations for the emails, all or none. Callers that just authorized the caller as an
 * owner or admin of the host organization pass their viewer; others are checked as sharing
 * managers here. The organization's limits apply to the whole batch.
 */
export async function queueSharingInvitations(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  conversation: Conversation,
  input: { emails: string[]; shareHistory: boolean },
  authorized?: Viewer,
) {
  if (!input.emails.length) return [];
  const viewer = authorized ?? (await requireSharingManager(db, scope, conversation));
  if (authorized && !canShare(conversation, authorized, { connected: false, visible: false }))
    throw new AccessDeniedError();
  validateExternalInvitations(conversation, viewer, {
    count: input.emails.length,
    shareHistory: input.shareHistory,
  });
  const emails = [
    ...new Set(
      input.emails.map((email) => {
        const parsed = sharingInviteInput.shape.email.safeParse(email.trim().toLowerCase());
        if (!parsed.success) throw new ValidationError("An exact email address is required.");
        return parsed.data;
      }),
    ),
  ];
  // Serialize the per-org limits across different conversations.
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`messaging-invitations:${scope.organizationId}`}, 0))`,
  );
  const [totals] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${gt(
        messagingInvitations.createdAt,
        new Date(Date.now() - 3_600_000),
      )})::int`,
      pending: sql<number>`count(*) filter (where ${and(
        eq(messagingInvitations.status, "pending"),
        gt(messagingInvitations.expiresAt, new Date()),
      )})::int`,
    })
    .from(messagingInvitations)
    .where(eq(messagingInvitations.senderOrganizationId, scope.organizationId));
  if ((totals?.sent ?? 0) + emails.length > 100)
    throw new ValidationError("Too many invitations. Try again in an hour.");
  if ((totals?.pending ?? 0) + emails.length > 100)
    throw new ValidationError("Resolve pending invitations before sending more.");
  if (conversation.kind === "dm") {
    const otherPeople = await db
      .select({ email: user.email })
      .from(messagingParticipants)
      .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
      .innerJoin(user, eq(user.id, actors.userId))
      .where(
        and(
          eq(messagingParticipants.conversationId, conversation.id),
          ne(user.id, conversation.createdBy),
        ),
      );
    if (otherPeople.some((person) => emails.some((email) => person.email !== email)))
      throw new ValidationError("A direct message can only have two people.");
  }
  // A new invitation to the same address replaces the previous one.
  await db
    .update(messagingInvitations)
    .set({ status: "revoked" })
    .where(
      and(
        eq(messagingInvitations.conversationId, conversation.id),
        eq(messagingInvitations.senderOrganizationId, scope.organizationId),
        inArray(messagingInvitations.email, emails),
        eq(messagingInvitations.status, "pending"),
      ),
    );
  const target = invitationTarget(conversation, viewer);
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  const invitations = await db
    .insert(messagingInvitations)
    .values(
      emails.map((email) => ({
        conversationId: conversation.id,
        hostOrganizationId: conversation.organizationId,
        senderOrganizationId: scope.organizationId,
        inviterId: scope.userId,
        email,
        ...target,
        expiresAt,
      })),
    )
    .returning();
  await recordSharingEvents(
    db,
    scope,
    conversation.id,
    "invited",
    invitations.map((invitation) => ({ invitationId: invitation.id })),
  );
  return invitations;
}

export async function readSharingInvitation(db: DatabaseExecutor, userId: string, id: string) {
  const [invitation] = await db
    .select()
    .from(messagingInvitations)
    .where(eq(messagingInvitations.id, id));
  if (!invitation) throw new AccessDeniedError();
  await requireSharingRecipient(db, userId, invitation);
  const [row] = await db
    .select({
      name: messagingConversations.name,
      kind: messagingConversations.kind,
      hostName: organization.name,
    })
    .from(messagingConversations)
    .innerJoin(organization, eq(organization.id, messagingConversations.organizationId))
    .where(eq(messagingConversations.id, invitation.conversationId));
  if (!row) throw new AccessDeniedError();
  return {
    id: invitation.id,
    ...row,
    email: invitation.email,
    purpose: invitation.purpose,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    hostOrganizationId: invitation.hostOrganizationId,
    conversationId:
      invitation.status === "accepted" && invitation.recipientUserId === userId
        ? invitation.conversationId
        : null,
    targetOrganizationId: invitation.targetOrganizationId,
    approvalRequested: !!invitation.recipientUserId,
  };
}

export async function declineSharingInvitation(db: DatabaseExecutor, userId: string, id: string) {
  return db.transaction(async (tx) => {
    const [lookup] = await tx
      .select()
      .from(messagingInvitations)
      .where(eq(messagingInvitations.id, id));
    if (!lookup) throw new AccessDeniedError();
    await lockConversation(tx, lookup.conversationId, "update");
    const [invite] = await tx
      .select()
      .from(messagingInvitations)
      .where(eq(messagingInvitations.id, id))
      .for("update");
    if (!invite) throw new AccessDeniedError();
    await requireSharingRecipient(tx, userId, invite);
    if (invite.status !== "pending")
      throw new ValidationError("This invitation is no longer available.");
    await tx
      .update(messagingInvitations)
      .set({ status: "declined" })
      .where(eq(messagingInvitations.id, id));
    await recordSharingEvents(
      tx,
      { userId, organizationId: invite.hostOrganizationId },
      invite.conversationId,
      "declined",
      [{ invitationId: id }],
    );
    return { declined: true, hints: await sharingInvitationHints(tx, invite) };
  });
}

export function invitationOperations(db: DatabaseExecutor, scope: SessionIdentity) {
  return {
    async invite(conversationId: string, input: { email: string; shareHistory: boolean }) {
      return db.transaction(async (tx) => {
        const conversation = await lockConversation(tx, conversationId, "update");
        const [invitation] = await queueSharingInvitations(tx, scope, conversation, {
          emails: [input.email],
          shareHistory: input.shareHistory,
        });
        return { ...invitation!, hints: await sharingInvitationHints(tx, invitation!) };
      });
    },
    async accept(id: string, shareHistory: boolean) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { admin } = await workspaceContext(tx, scope);
        const [lookup] = await tx
          .select()
          .from(messagingInvitations)
          .where(eq(messagingInvitations.id, id));
        if (!lookup) throw new AccessDeniedError();
        const conversation = await lockConversation(tx, lookup.conversationId, "update");
        const [invite] = await tx
          .select()
          .from(messagingInvitations)
          .where(eq(messagingInvitations.id, id))
          .for("update");
        if (!invite) throw new AccessDeniedError();
        const person = await requireSharingRecipient(tx, scope.userId, invite);
        if (invite.status === "accepted" && invite.targetOrganizationId === scope.organizationId) {
          const [participant] = await tx
            .select({ id: messagingConversations.id })
            .from(messagingConversations)
            .where(
              and(
                eq(messagingConversations.id, conversation.id),
                visibleConversations(tx, {
                  userId: invite.recipientUserId ?? "",
                  organizationId: scope.organizationId,
                }),
              ),
            );
          if (!participant) throw new ValidationError("This invitation no longer grants access.");
          return {
            status: "accepted" as const,
            organizationId: scope.organizationId,
            conversationId: invite.recipientUserId === scope.userId ? conversation.id : null,
            // A replay changes nothing. The hints let viewers recover from a lost first publish.
            hints: await sharingInvitationHints(tx, invite),
          };
        }
        if (invite.status !== "pending" || invite.expiresAt <= new Date())
          throw new ValidationError("This invitation is no longer available.");
        if (!shareHistory)
          throw new ValidationError("Confirm that the full conversation history will be shared.");
        if (scope.organizationId === invite.hostOrganizationId)
          throw new ValidationError(
            "Choose your own partner organization, not the inviting workspace.",
          );
        if (invite.targetOrganizationId && invite.targetOrganizationId !== scope.organizationId)
          throw new AccessDeniedError();
        await requireSharingManager(
          tx,
          { userId: invite.inviterId, organizationId: invite.senderOrganizationId },
          conversation,
        );
        const originalId = invite.recipientUserId ?? person.id;
        const [original] = await tx
          .select({ name: user.name })
          .from(user)
          .innerJoin(
            member,
            and(eq(member.userId, user.id), eq(member.organizationId, scope.organizationId)),
          )
          .where(and(eq(user.id, originalId), eq(user.emailVerified, true)));
        if (!original) throw new AccessDeniedError();
        if (invite.purpose === "organization" && !admin) {
          const [requested] = await tx
            .update(messagingInvitations)
            .set({ targetOrganizationId: scope.organizationId, recipientUserId: person.id })
            .where(eq(messagingInvitations.id, id))
            .returning();
          await recordSharingEvents(tx, scope, conversation.id, "approval-requested", [
            { invitationId: id, targetOrganizationId: scope.organizationId },
          ]);
          return {
            status: "approval-required" as const,
            organizationId: scope.organizationId,
            conversationId: null,
            hints: await sharingInvitationHints(tx, requested!),
          };
        }
        // Partner-managed individual invitations cannot reactivate a disconnected org.
        const connectionActive = await hasSharingConnection(
          tx,
          conversation.id,
          scope.organizationId,
        );
        if (invite.senderOrganizationId !== invite.hostOrganizationId && !connectionActive)
          throw new AccessDeniedError();
        // Individual consent must not replace the organization's original approval provenance.
        if (!connectionActive)
          await tx
            .insert(messagingConnections)
            .values({
              conversationId: conversation.id,
              organizationId: scope.organizationId,
              approvedBy: scope.userId,
            })
            .onConflictDoUpdate({
              target: [messagingConnections.conversationId, messagingConnections.organizationId],
              set: { disconnectedAt: null, approvedBy: scope.userId, approvedAt: new Date() },
            });
        const actor = await ensureHumanActor(tx, {
          userId: originalId,
          organizationId: scope.organizationId,
        });
        await writeMembers(
          tx,
          conversation.id,
          [{ entityId: actor.entityId, type: "human", organizationId: scope.organizationId }],
          "consent",
        );
        const [accepted] = await tx
          .update(messagingInvitations)
          .set({
            status: "accepted",
            targetOrganizationId: scope.organizationId,
            recipientUserId: originalId,
          })
          .where(eq(messagingInvitations.id, id))
          .returning();
        await recordSharingEvents(tx, scope, conversation.id, "accepted", [
          { invitationId: id, targetOrganizationId: scope.organizationId },
        ]);
        return {
          status: "accepted" as const,
          organizationId: scope.organizationId,
          conversationId: originalId === scope.userId ? conversation.id : null,
          hints: await sharingInvitationHints(tx, accepted!),
        };
      });
    },
    decline: (id: string) => declineSharingInvitation(db, scope.userId, id),
    async revoke(id: string) {
      return db.transaction(async (tx) => {
        const [invite] = await tx
          .select()
          .from(messagingInvitations)
          .where(eq(messagingInvitations.id, id));
        if (!invite) throw new AccessDeniedError();
        const conversation = await lockConversation(tx, invite.conversationId, "update");
        await requireSharingManager(tx, scope, conversation);
        if (
          invite.senderOrganizationId !== scope.organizationId &&
          conversation.organizationId !== scope.organizationId
        )
          throw new AccessDeniedError();
        const revoked = await tx
          .update(messagingInvitations)
          .set({ status: "revoked" })
          .where(and(eq(messagingInvitations.id, id), eq(messagingInvitations.status, "pending")))
          .returning({ id: messagingInvitations.id });
        if (!revoked.length) throw new ValidationError("This invitation is no longer pending.");
        await recordSharingEvents(tx, scope, conversation.id, "revoked", [{ invitationId: id }]);
        return { revoked: true, hints: await sharingInvitationHints(tx, invite) };
      });
    },
    async resend(id: string) {
      return db.transaction(async (tx) => {
        const [invite] = await tx
          .select()
          .from(messagingInvitations)
          .where(eq(messagingInvitations.id, id));
        if (!invite) throw new AccessDeniedError();
        const conversation = await lockConversation(tx, invite.conversationId, "update");
        if (invite.senderOrganizationId !== scope.organizationId) throw new AccessDeniedError();
        const [current] = await tx
          .select({ status: messagingInvitations.status })
          .from(messagingInvitations)
          .where(eq(messagingInvitations.id, id));
        if (current?.status === "accepted")
          throw new ValidationError("This invitation was already accepted.");
        const [invitation] = await queueSharingInvitations(tx, scope, conversation, {
          emails: [invite.email],
          shareHistory: true,
        });
        return { ...invitation!, hints: await sharingInvitationHints(tx, invitation!) };
      });
    },
  };
}
import type { SessionIdentity } from "../../../core/session/identity";
