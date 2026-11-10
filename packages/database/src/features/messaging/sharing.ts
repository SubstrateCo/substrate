import { sharingInviteInput } from "@startup-os/contracts/messaging/sharing";

import type { DatabaseExecutor } from "../../client";
import { ensureHumanActor } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import { workspaceContext } from "../context/access";
import { conversationRemovalHints } from "../realtime/routing";
import { visibleConversations, type MessagingIdentity } from "./access";
import { invitationTarget, partnerTargetAllowed } from "./policy";
import { messagingConversations, messagingParticipants } from "./schema";
import {
  hasSharingConnection,
  lockSharingConversation,
  requireSharingManager,
  requireSharingRecipient,
  recordSharingEvent,
  type SharingConversation,
} from "./sharing-access";
import { createSharingQueries } from "./sharing-queries";
import { messagingConnections, messagingInvitations } from "./sharing.schema";
import { and, count, eq, gt, ne, or, sql } from "drizzle-orm";

export async function queueSharingInvitation(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  conversation: SharingConversation,
  email: string,
  shareHistory: boolean,
) {
  const viewer = await requireSharingManager(db, scope, conversation);
  if (!shareHistory)
    throw new ValidationError(
      "Confirm that invited people can read the full conversation history.",
    );
  const parsedEmail = sharingInviteInput.shape.email.safeParse(email.trim().toLowerCase());
  if (!parsedEmail.success) throw new ValidationError("An exact email address is required.");
  const normalized = parsedEmail.data;
  // Serialize the per-org limit across different conversations.
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`messaging-invitations:${scope.organizationId}`}, 0))`,
  );
  const [limit] = await db
    .select({ total: count() })
    .from(messagingInvitations)
    .where(
      and(
        eq(messagingInvitations.senderOrganizationId, scope.organizationId),
        gt(messagingInvitations.createdAt, new Date(Date.now() - 3_600_000)),
      ),
    );
  if ((limit?.total ?? 0) >= 100)
    throw new ValidationError("Too many invitations. Try again in an hour.");
  const [pending] = await db
    .select({ total: count() })
    .from(messagingInvitations)
    .where(
      and(
        eq(messagingInvitations.senderOrganizationId, scope.organizationId),
        eq(messagingInvitations.status, "pending"),
        gt(messagingInvitations.expiresAt, new Date()),
      ),
    );
  if ((pending?.total ?? 0) >= 100)
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
    if (otherPeople.some((person) => person.email.toLowerCase() !== normalized))
      throw new ValidationError("A direct message can only have two people.");
  }
  await db
    .update(messagingInvitations)
    .set({ status: "revoked" })
    .where(
      and(
        eq(messagingInvitations.conversationId, conversation.id),
        eq(messagingInvitations.senderOrganizationId, scope.organizationId),
        eq(messagingInvitations.email, normalized),
        eq(messagingInvitations.status, "pending"),
      ),
    );
  const [invitation] = await db
    .insert(messagingInvitations)
    .values({
      conversationId: conversation.id,
      hostOrganizationId: conversation.organizationId,
      senderOrganizationId: scope.organizationId,
      inviterId: scope.userId,
      email: normalized,
      ...invitationTarget(conversation, viewer),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    })
    .returning();
  await recordSharingEvent(db, scope, conversation.id, "invited", { invitationId: invitation!.id });
  return invitation!;
}

export function createSharingService(db: DatabaseExecutor, scope: MessagingIdentity) {
  return {
    ...createSharingQueries(db, scope),
    async invite(conversationId: string, input: { email: string; shareHistory: boolean }) {
      return db.transaction(async (tx) => {
        const conversation = await lockSharingConversation(tx, conversationId);
        return queueSharingInvitation(tx, scope, conversation, input.email, input.shareHistory);
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
        const conversation = await lockSharingConversation(tx, lookup.conversationId);
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
          await tx
            .update(messagingInvitations)
            .set({ targetOrganizationId: scope.organizationId, recipientUserId: person.id })
            .where(eq(messagingInvitations.id, id));
          await recordSharingEvent(tx, scope, conversation.id, "approval-requested", {
            invitationId: id,
            targetOrganizationId: scope.organizationId,
          });
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
          name: original.name,
        });
        await tx
          .insert(messagingParticipants)
          .values({
            conversationId: conversation.id,
            organizationId: scope.organizationId,
            actorEntityId: actor.entityId,
            actorType: "human",
            consentedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [messagingParticipants.conversationId, messagingParticipants.actorEntityId],
            set: { leftAt: null, consentedAt: new Date() },
          });
        await tx
          .update(messagingInvitations)
          .set({
            status: "accepted",
            targetOrganizationId: scope.organizationId,
            recipientUserId: originalId,
          })
          .where(eq(messagingInvitations.id, id));
        await recordSharingEvent(tx, scope, conversation.id, "accepted", {
          invitationId: id,
          targetOrganizationId: scope.organizationId,
        });
        return {
          status: "accepted" as const,
          organizationId: scope.organizationId,
          conversationId: originalId === scope.userId ? conversation.id : null,
        };
      });
    },
    async decline(id: string) {
      return db.transaction(async (tx) => {
        const [lookup] = await tx
          .select()
          .from(messagingInvitations)
          .where(eq(messagingInvitations.id, id));
        if (!lookup) throw new AccessDeniedError();
        await lockSharingConversation(tx, lookup.conversationId);
        const [invite] = await tx
          .select()
          .from(messagingInvitations)
          .where(eq(messagingInvitations.id, id))
          .for("update");
        if (!invite) throw new AccessDeniedError();
        await requireSharingRecipient(tx, scope.userId, invite);
        if (invite.status !== "pending")
          throw new ValidationError("This invitation is no longer available.");
        await tx
          .update(messagingInvitations)
          .set({ status: "declined" })
          .where(eq(messagingInvitations.id, id));
        await recordSharingEvent(
          tx,
          { ...scope, organizationId: invite.hostOrganizationId },
          invite.conversationId,
          "declined",
          { invitationId: id },
        );
        return { declined: true };
      });
    },
    async revoke(id: string) {
      return db.transaction(async (tx) => {
        const [invite] = await tx
          .select()
          .from(messagingInvitations)
          .where(eq(messagingInvitations.id, id));
        if (!invite) throw new AccessDeniedError();
        const conversation = await lockSharingConversation(tx, invite.conversationId);
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
        await recordSharingEvent(tx, scope, conversation.id, "revoked", { invitationId: id });
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
        const conversation = await lockSharingConversation(tx, invite.conversationId);
        if (invite.senderOrganizationId !== scope.organizationId) throw new AccessDeniedError();
        const [current] = await tx
          .select({ status: messagingInvitations.status })
          .from(messagingInvitations)
          .where(eq(messagingInvitations.id, id));
        if (current?.status === "accepted")
          throw new ValidationError("This invitation was already accepted.");
        return queueSharingInvitation(tx, scope, conversation, invite.email, true);
      });
    },
    async disconnect(conversationId: string, partnerOrganizationId: string) {
      return db.transaction(async (tx) => {
        const conversation = await lockSharingConversation(tx, conversationId);
        const viewer = await requireSharingManager(tx, scope, conversation);
        if (!partnerTargetAllowed(conversation, viewer, partnerOrganizationId))
          throw new AccessDeniedError();
        const hints = await conversationRemovalHints(tx, conversation);
        await tx
          .update(messagingConnections)
          .set({ disconnectedAt: new Date() })
          .where(
            and(
              eq(messagingConnections.conversationId, conversationId),
              eq(messagingConnections.organizationId, partnerOrganizationId),
            ),
          );
        await tx
          .update(messagingParticipants)
          .set({ leftAt: new Date(), consentedAt: null })
          .where(
            and(
              eq(messagingParticipants.conversationId, conversationId),
              eq(messagingParticipants.organizationId, partnerOrganizationId),
            ),
          );
        // Invitations to other partners and host invitations without a target stay pending.
        await tx
          .update(messagingInvitations)
          .set({ status: "revoked" })
          .where(
            and(
              eq(messagingInvitations.conversationId, conversationId),
              eq(messagingInvitations.status, "pending"),
              or(
                eq(messagingInvitations.senderOrganizationId, partnerOrganizationId),
                eq(messagingInvitations.targetOrganizationId, partnerOrganizationId),
              ),
            ),
          );
        await recordSharingEvent(tx, scope, conversationId, "disconnected", {
          targetOrganizationId: partnerOrganizationId,
        });
        return {
          disconnected: true,
          hints: hints.map((hint) => ({ ...hint, domain: "access" as const })),
        };
      });
    },
    async remove(conversationId: string, actorId: string) {
      return db.transaction(async (tx) => {
        const conversation = await lockSharingConversation(tx, conversationId);
        const viewer = await requireSharingManager(tx, scope, conversation);
        const [participant] = await tx
          .select()
          .from(messagingParticipants)
          .where(
            and(
              eq(messagingParticipants.conversationId, conversationId),
              eq(messagingParticipants.actorEntityId, actorId),
            ),
          );
        if (!participant || !partnerTargetAllowed(conversation, viewer, participant.organizationId))
          throw new AccessDeniedError();
        const hints = await conversationRemovalHints(tx, conversation);
        await tx
          .update(messagingParticipants)
          .set({ leftAt: new Date(), consentedAt: null })
          .where(
            and(
              eq(messagingParticipants.conversationId, conversationId),
              eq(messagingParticipants.actorEntityId, actorId),
            ),
          );
        await recordSharingEvent(tx, scope, conversationId, "removed", {
          targetOrganizationId: participant.organizationId,
        });
        return {
          removed: true,
          hints: hints.map((hint) => ({ ...hint, domain: "access" as const })),
        };
      });
    },
  };
}
