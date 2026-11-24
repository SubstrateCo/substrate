import type { RepositoryContext } from "../../core/repository-context";
import { messageEntityReferences } from "../context/schema";
import { visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { and, eq, isNull } from "drizzle-orm";

/** Call after archive access; a source is returned only while the message is still readable. */
export async function sourceMessageOf(ctx: RepositoryContext, meetingId: string) {
  if (!ctx.scope.userId) return null;
  const [source] = await ctx.db
    .select({ messageId: messagingMessages.id, conversationId: messagingConversations.id })
    .from(messageEntityReferences)
    .innerJoin(messagingMessages, eq(messagingMessages.id, messageEntityReferences.messageId))
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messagingMessages.conversationId),
    )
    .where(
      and(
        eq(messageEntityReferences.organizationId, ctx.scope.organizationId),
        eq(messageEntityReferences.entityId, meetingId),
        eq(messageEntityReferences.purpose, "source"),
        isNull(messagingMessages.deletedAt),
        visibleConversations(ctx.db, {
          userId: ctx.scope.userId,
          organizationId: ctx.scope.organizationId,
        }),
      ),
    );
  return source ?? null;
}
