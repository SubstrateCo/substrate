import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { conversationRemovalHints } from "../realtime/routing";
import { endParticipation } from "./members";
import { messagingConversations, messagingParticipants } from "./schema";
import { messagingInvitations } from "./sharing.schema";
import { and, asc, eq, inArray, ne, or } from "drizzle-orm";

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
    const hints = await conversationRemovalHints(tx, conversations);
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
    return hints.map((hint) => ({ ...hint, domain: "access" as const }));
  });
}
