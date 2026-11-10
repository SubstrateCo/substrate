import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { conversationRemovalHints } from "../realtime/routing";
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
    const ids = await tx
      .select({ id: messagingConversations.id })
      .from(messagingParticipants)
      .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingParticipants.conversationId),
      )
      .where(
        and(
          eq(actors.userId, userId),
          eq(actors.organizationId, organizationId),
          ne(messagingConversations.organizationId, organizationId),
        ),
      );
    const conversations = ids.length
      ? await tx
          .select()
          .from(messagingConversations)
          .where(
            inArray(
              messagingConversations.id,
              ids.map((row) => row.id),
            ),
          )
          .orderBy(asc(messagingConversations.id))
          .for("update")
      : [];
    const hints = (
      await Promise.all(
        conversations.map((conversation) => conversationRemovalHints(tx, conversation)),
      )
    ).flat();
    if (ids.length)
      await tx
        .update(messagingParticipants)
        .set({ consentedAt: null, leftAt: new Date() })
        .where(
          and(
            inArray(
              messagingParticipants.conversationId,
              ids.map((row) => row.id),
            ),
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
