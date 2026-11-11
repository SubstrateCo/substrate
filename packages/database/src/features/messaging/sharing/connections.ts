import { realtimeKeys } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../../client";
import { actors } from "../../../core/actors/schema";
import { effectsFor } from "../../../core/effects";
import type { SessionIdentity } from "../../../core/session/identity";
import { AccessDeniedError } from "../../../errors";
import { withRemovalHints } from "../../realtime/routing";
import { lockConversation } from "../access";
import { endParticipation } from "../members";
import { partnerTargetAllowed } from "../policy";
import { messagingConversations, messagingParticipants } from "../schema";
import { messagingConnections, messagingInvitations } from "../sharing.schema";
import { requireSharingManager, recordSharingEvents } from "./access";
import { and, eq, inArray, ne, or, asc } from "drizzle-orm";

export function connectionOperations(db: DatabaseExecutor, scope: SessionIdentity) {
  return {
    async disconnect(conversationId: string, partnerOrganizationId: string) {
      return db.transaction(async (tx) => {
        const conversation = await lockConversation(tx, conversationId, "update");
        const viewer = await requireSharingManager(tx, scope, conversation);
        if (!partnerTargetAllowed(conversation, viewer, partnerOrganizationId))
          throw new AccessDeniedError();
        await withRemovalHints(
          tx,
          [conversation],
          async () => {
            await tx
              .update(messagingConnections)
              .set({ disconnectedAt: new Date() })
              .where(
                and(
                  eq(messagingConnections.conversationId, conversationId),
                  eq(messagingConnections.organizationId, partnerOrganizationId),
                ),
              );
            await endParticipation(
              tx,
              and(
                eq(messagingParticipants.conversationId, conversationId),
                eq(messagingParticipants.organizationId, partnerOrganizationId),
              ),
            );
          },
          { domain: "access" },
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
        await recordSharingEvents(tx, scope, conversationId, "disconnected", [
          { targetOrganizationId: partnerOrganizationId },
        ]);
        effectsFor(tx).hint({
          audience: realtimeKeys.organization(scope.organizationId),
          domain: "access",
        });
        effectsFor(tx).hint({
          audience: realtimeKeys.organization(partnerOrganizationId),
          domain: "access",
        });
        return {
          disconnected: true,
        };
      });
    },
    async remove(conversationId: string, actorId: string) {
      return db.transaction(async (tx) => {
        const conversation = await lockConversation(tx, conversationId, "update");
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
        await withRemovalHints(
          tx,
          [conversation],
          () =>
            endParticipation(
              tx,
              and(
                eq(messagingParticipants.conversationId, conversationId),
                eq(messagingParticipants.actorEntityId, actorId),
              ),
            ),
          { domain: "access" },
        );
        await recordSharingEvents(tx, scope, conversationId, "removed", [
          { targetOrganizationId: participant.organizationId },
        ]);
        return {
          removed: true,
        };
      });
    },
  };
}

// Run on departure and before provisioning a rejoined membership. Rejoining is not fresh consent.
export async function clearMembershipSharing(
  db: DatabaseExecutor,
  userId: string,
  organizationId: string,
) {
  return db.transaction(async (tx) => {
    // Lock the person's external conversations in ID order, so concurrent changes cannot deadlock.
    const conversations = await tx
      .select({
        id: messagingConversations.id,
        organizationId: messagingConversations.organizationId,
      })
      .from(messagingConversations)
      .where(
        and(
          ne(messagingConversations.organizationId, organizationId),
          inArray(
            messagingConversations.id,
            tx
              .select({ id: messagingParticipants.conversationId })
              .from(messagingParticipants)
              .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
              .where(and(eq(actors.userId, userId), eq(actors.organizationId, organizationId))),
          ),
        ),
      )
      .orderBy(asc(messagingConversations.id))
      .for("update");
    const ids = conversations.map((row) => row.id);
    await withRemovalHints(
      tx,
      conversations,
      async () => {
        if (ids.length)
          await endParticipation(
            tx,
            and(
              inArray(messagingParticipants.conversationId, ids),
              inArray(
                messagingParticipants.actorEntityId,
                tx
                  .select({ id: actors.entityId })
                  .from(actors)
                  .where(and(eq(actors.userId, userId), eq(actors.organizationId, organizationId))),
              ),
            ),
          );
      },
      { domain: "access" },
    );
    await tx
      .update(messagingInvitations)
      .set({ status: "revoked" })
      .where(
        and(
          eq(messagingInvitations.status, "pending"),
          or(
            and(
              eq(messagingInvitations.senderOrganizationId, organizationId),
              eq(messagingInvitations.inviterId, userId),
            ),
            and(
              eq(messagingInvitations.targetOrganizationId, organizationId),
              eq(messagingInvitations.recipientUserId, userId),
            ),
          ),
        ),
      );
    return null;
  });
}
