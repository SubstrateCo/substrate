import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
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
import { saveMessagingReference } from "./messaging-references";
import { messageReferences } from "./references";
import { messageEntityReferences } from "./schema";
import { and, eq, or, sql } from "drizzle-orm";

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
    if (reference.kind === "channel" || reference.kind === "thread") {
      await saveMessagingReference(db, scope, message, conversationOrganizationId, {
        ...reference,
        kind: reference.kind,
      });
      continue;
    }
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
      if (author.userId && !recipients.has(author.userId)) recipients.set(author.userId, "reply");
  }
  if (!scope.actorEntityId) recipients.delete(scope.userId);
  if (recipients.size) {
    await db.execute(sql`
      INSERT INTO ${notifications} (organization_id, recipient_actor_entity_id, kind, event_key, message_id)
      SELECT ${actors.organizationId}, ${actors.entityId}, recipient.kind, ${message.id}, ${message.id}::uuid
      FROM ${actors}
      JOIN (VALUES ${sql.join(
        [...recipients].map(([userId, kind]) => sql`(${userId}::text, ${kind}::text)`),
        sql`, `,
      )}) AS recipient(user_id, kind) ON recipient.user_id = ${actors.userId}
      JOIN ${user} ON ${user.id} = ${actors.userId} AND ${user.emailVerified} = true
      JOIN ${entities} ON ${entities.entityId} = ${actors.entityId}
        AND ${entities.organizationId} = ${actors.organizationId} AND ${entities.deletedAt} IS NULL
      JOIN ${member} ON ${member.userId} = ${user.id} AND ${member.organizationId} = ${actors.organizationId}
      JOIN ${messagingConversations} ON ${messagingConversations.id} = ${message.conversationId}::uuid
        AND ${visibleConversations(db, { userId: actors.userId, organizationId: actors.organizationId })}
      LEFT JOIN ${messagingParticipants} ON ${messagingParticipants.conversationId} = ${messagingConversations.id}
        AND ${messagingParticipants.userId} = ${actors.userId}
        AND ${messagingParticipants.organizationId} = ${actors.organizationId}
      WHERE ${actors.disabledAt} IS NULL
        AND (${actors.organizationId} = ${conversationOrganizationId} OR ${messagingParticipants.userId} IS NOT NULL)
      ON CONFLICT DO NOTHING
    `);
  }
}
