import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { visibleConversations, type MessagingIdentity } from "../messaging/access";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../messaging/schema";
import { notifications } from "../notifications/schema";
import { requireWork } from "./access";
import { messageReferences } from "./references";
import { messageEntityReferences } from "./schema";
import { and, eq, or } from "drizzle-orm";

export async function applyMessageEffects(
  ctx: RepositoryContext,
  scope: MessagingIdentity,
  message: typeof messagingMessages.$inferSelect,
  conversationOrganizationId: string,
) {
  const { db } = ctx;
  const recipients = new Map<string, "mention" | "reply">();
  const references = messageReferences(message.body);
  for (const reference of references) {
    if (reference.kind !== "person") {
      if (conversationOrganizationId !== scope.organizationId) throw new AccessDeniedError();
      const work = await requireWork(ctx, reference.id);
      if (work.entityType !== reference.kind) throw new AccessDeniedError();
      await db
        .insert(messageEntityReferences)
        .values({
          organizationId: scope.organizationId,
          conversationId: message.conversationId,
          messageId: message.id,
          entityId: reference.id,
          entityType: work.entityType,
          purpose: "mention",
          createdByActorEntityId: ctx.scope.actorEntityId,
        })
        .onConflictDoNothing();
    } else {
      const [actor] = await db
        .select()
        .from(actors)
        .where(
          and(eq(actors.entityId, reference.id), eq(actors.organizationId, scope.organizationId)),
        );
      if (!actor?.userId) throw new AccessDeniedError();
      await ctx.requireActiveActor(reference.id);
      const [visible] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.id, message.conversationId),
            visibleConversations(db, {
              userId: actor.userId,
              organizationId: scope.organizationId,
            }),
          ),
        );
      if (!visible) throw new AccessDeniedError();
      recipients.set(actor.userId, "mention");
    }
  }
  if (message.threadId) {
    const authors = await db
      .selectDistinct({ userId: messagingMessages.authorId })
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.conversationId, message.conversationId),
          or(
            eq(messagingMessages.id, message.threadId),
            eq(messagingMessages.threadId, message.threadId),
          ),
        ),
      );
    for (const author of authors)
      if (!recipients.has(author.userId)) recipients.set(author.userId, "reply");
  }
  recipients.delete(scope.userId);
  for (const [userId, kind] of recipients) {
    const candidates = await db
      .select({ actor: actors })
      .from(actors)
      .innerJoin(user, eq(user.id, actors.userId))
      .innerJoin(
        member,
        and(eq(member.userId, user.id), eq(member.organizationId, actors.organizationId)),
      )
      .where(and(eq(actors.userId, userId), eq(user.emailVerified, true)));
    for (const { actor } of candidates) {
      if (actor.disabledAt) continue;
      const [visible] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.id, message.conversationId),
            visibleConversations(db, { userId, organizationId: actor.organizationId }),
          ),
        );
      if (!visible) continue;
      // Only the participant's workspace receives cross-workspace conversation notifications.
      const [participant] = await db
        .select()
        .from(messagingParticipants)
        .where(
          and(
            eq(messagingParticipants.conversationId, message.conversationId),
            eq(messagingParticipants.userId, userId),
            eq(messagingParticipants.organizationId, actor.organizationId),
          ),
        );
      if (!participant && actor.organizationId !== conversationOrganizationId) continue;
      await db
        .insert(notifications)
        .values({
          organizationId: actor.organizationId,
          recipientActorEntityId: actor.entityId,
          kind,
          eventKey: message.id,
          messageId: message.id,
        })
        .onConflictDoNothing();
    }
  }
}
