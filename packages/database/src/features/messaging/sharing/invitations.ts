import {
  sharingInvitationMachine,
  sharingInviteInput,
} from "@substrate/contracts/messaging/sharing";
import { realtimeKeys } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../../client";
import { ensureHumanActor } from "../../../core/actors/provisioning";
import { actors } from "../../../core/actors/schema";
import { user } from "../../../core/authentication/schema";
import { effectsFor } from "../../../core/effects";
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
  // Per-org limits are approximate: concurrent batches may each pass these counts.
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
    .set({ status: sharingInvitationMachine.events.revoke.to })
    .where(
      and(
        eq(messagingInvitations.conversationId, conversation.id),
        eq(messagingInvitations.senderOrganizationId, scope.organizationId),
        inArray(messagingInvitations.email, emails),
        inArray(messagingInvitations.status, sharingInvitationMachine.from("revoke")),
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
  const effects = effectsFor(db);
  for (const invitation of invitations)
    for (const hint of await sharingInvitationHints(db, invitation)) effects.hint(hint);
  effects.mail("sharing");
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
    const [invite] = await tx
      .select()
      .from(messagingInvitations)
      .where(eq(messagingInvitations.id, id));
    if (!invite) throw new AccessDeniedError();
    await requireSharingRecipient(tx, userId, invite);
    if (!sharingInvitationMachine.canFire(invite.status, "decline"))
      throw new ValidationError("This invitation is no longer available.");
    const declined = await tx
      .update(messagingInvitations)
      .set({ status: sharingInvitationMachine.events.decline.to })
      .where(
        and(
          eq(messagingInvitations.id, id),
          inArray(messagingInvitations.status, sharingInvitationMachine.from("decline")),
        ),
      )
      .returning({ id: messagingInvitations.id });
    if (!declined.length) throw new ValidationError("This invitation is no longer available.");
    await recordSharingEvents(
      tx,
      { userId, organizationId: invite.hostOrganizationId },
      invite.conversationId,
      "declined",
      [{ invitationId: id }],
    );
    const hints = await sharingInvitationHints(tx, invite);
    for (const hint of hints) effectsFor(tx).hint(hint);
    return { declined: true };
  });
}

export function invitationOperations(db: DatabaseExecutor, scope: SessionIdentity) {
  return {
    async invite(conversationId: string, input: { email: string; shareHistory: boolean }) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        // Check membership before taking the lock, as accept does. The manager check needs the
        // locked row, so it runs after.
        await workspaceContext(tx, scope);
        const conversation = await lockConversation(tx, conversationId, "update");
        const [invitation] = await queueSharingInvitations(tx, scope, conversation, {
          emails: [input.email],
          shareHistory: input.shareHistory,
        });
        return invitation!;
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
          .where(eq(messagingInvitations.id, id));
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
          effectsFor(tx).replay([
            ...(await sharingInvitationHints(tx, invite)),
            { audience: realtimeKeys.user(scope.userId), domain: "access" },
          ]);
          return {
            status: "accepted" as const,
            organizationId: scope.organizationId,
            conversationId: invite.recipientUserId === scope.userId ? conversation.id : null,
          };
        }
        if (
          !sharingInvitationMachine.canFire(invite.status, "accept") ||
          invite.expiresAt <= new Date()
        )
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
            .set({
              status: sharingInvitationMachine.events.requestApproval.to,
              targetOrganizationId: scope.organizationId,
              recipientUserId: person.id,
            })
            .where(
              and(
                eq(messagingInvitations.id, id),
                inArray(
                  messagingInvitations.status,
                  sharingInvitationMachine.from("requestApproval"),
                ),
              ),
            )
            .returning();
          if (!requested) throw new ValidationError("This invitation is no longer available.");
          await recordSharingEvents(tx, scope, conversation.id, "approval-requested", [
            { invitationId: id, targetOrganizationId: scope.organizationId },
          ]);
          for (const hint of await sharingInvitationHints(tx, requested!))
            effectsFor(tx).hint(hint);
          effectsFor(tx).hint({ audience: realtimeKeys.user(scope.userId), domain: "access" });
          return {
            status: "approval-required" as const,
            organizationId: scope.organizationId,
            conversationId: null,
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
            status: sharingInvitationMachine.events.accept.to,
            targetOrganizationId: scope.organizationId,
            recipientUserId: originalId,
          })
          .where(
            and(
              eq(messagingInvitations.id, id),
              inArray(messagingInvitations.status, sharingInvitationMachine.from("accept")),
            ),
          )
          .returning();
        if (!accepted) throw new ValidationError("This invitation is no longer available.");
        await recordSharingEvents(tx, scope, conversation.id, "accepted", [
          { invitationId: id, targetOrganizationId: scope.organizationId },
        ]);
        for (const hint of await sharingInvitationHints(tx, accepted!)) effectsFor(tx).hint(hint);
        effectsFor(tx).hint({ audience: realtimeKeys.user(scope.userId), domain: "access" });
        return {
          status: "accepted" as const,
          organizationId: scope.organizationId,
          conversationId: originalId === scope.userId ? conversation.id : null,
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
          .set({ status: sharingInvitationMachine.events.revoke.to })
          .where(
            and(
              eq(messagingInvitations.id, id),
              inArray(messagingInvitations.status, sharingInvitationMachine.from("revoke")),
            ),
          )
          .returning({ id: messagingInvitations.id });
        if (!revoked.length) throw new ValidationError("This invitation is no longer pending.");
        await recordSharingEvents(tx, scope, conversation.id, "revoked", [{ invitationId: id }]);
        for (const hint of await sharingInvitationHints(tx, invite)) effectsFor(tx).hint(hint);
        return { revoked: true };
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
        return invitation!;
      });
    },
  };
}
import type { SessionIdentity } from "../../../core/session/identity";
