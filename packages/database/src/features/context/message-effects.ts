import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import {
  liveAgentMember,
  mentionablePerson,
  visibleConversations,
  type MessagingIdentity,
} from "../messaging/access";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../messaging/schema";
import { notifications } from "../notifications/schema";
import { readableWorkTargets } from "../notifications/targets";
import { saveMessagingReferences } from "./messaging-references";
import { messageReferences } from "./references";
import { messageEntityReferences } from "./schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

// `referenced` reports saved work or messaging references. `notified` lists the alerts created.
export async function applyMessageEffects(
  ctx: RepositoryContext,
  scope: MessagingIdentity,
  message: typeof messagingMessages.$inferSelect,
  conversationOrganizationId: string,
): Promise<{ referenced: boolean; notified: { organizationId: string; actorId: string }[] }> {
  const { db } = ctx;
  const recipients = new Map<string, "mention" | "reply">();
  const personIds: string[] = [];
  const agentIds: string[] = [];
  const workReferences: { id: string; kind: "task" | "project" }[] = [];
  const messagingReferences: { id: string; kind: "channel" | "thread" }[] = [];
  for (const reference of messageReferences(message.body)) {
    if (reference.kind === "channel" || reference.kind === "thread")
      messagingReferences.push({ id: reference.id, kind: reference.kind });
    else if (reference.kind === "person") personIds.push(reference.id);
    else if (reference.kind === "agent") agentIds.push(reference.id);
    else workReferences.push({ id: reference.id, kind: reference.kind });
  }
  await saveMessagingReferences(
    db,
    scope,
    message,
    conversationOrganizationId,
    messagingReferences,
  );
  let referenced = messagingReferences.length > 0;
  if (agentIds.length) {
    // A mentioned agent must be an active member of this conversation. Mentions notify nobody;
    // only the owner's mention can start a run, which the trigger evaluator decides.
    const members = await db
      .select({ id: messagingParticipants.actorEntityId })
      .from(messagingParticipants)
      .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
      .innerJoin(
        entities,
        and(
          eq(entities.entityId, actors.entityId),
          eq(entities.organizationId, actors.organizationId),
        ),
      )
      .where(
        and(
          liveAgentMember(message.conversationId),
          inArray(messagingParticipants.actorEntityId, agentIds),
          isNull(entities.deletedAt),
        ),
      );
    if (members.length !== agentIds.length)
      throw new ValidationError("Add the agent to this conversation before you mention it.");
  }
  if (personIds.length) {
    // Every mentioned person must be an active workspace member who can see this conversation.
    const people = await db
      .select({ userId: sql<string>`${actors.userId}` })
      .from(actors)
      .innerJoin(
        entities,
        and(
          eq(entities.entityId, actors.entityId),
          eq(entities.organizationId, actors.organizationId),
        ),
      )
      .innerJoin(messagingConversations, eq(messagingConversations.id, message.conversationId))
      .where(and(inArray(actors.entityId, personIds), mentionablePerson(db, scope.organizationId)));
    if (people.length !== personIds.length) throw new AccessDeniedError();
    for (const person of people) recipients.set(person.userId, "mention");
  }
  if (workReferences.length) {
    if (conversationOrganizationId !== scope.organizationId) throw new AccessDeniedError();
    // The caller has verified the active actor; this applies view access to the task and its project.
    const targets = await readableWorkTargets(
      ctx,
      workReferences.map((reference) => reference.id),
    );
    for (const reference of workReferences)
      if (targets.get(reference.id)?.entityType !== reference.kind) throw new AccessDeniedError();
    await db
      .insert(messageEntityReferences)
      .values(
        workReferences.map((reference) => ({
          organizationId: scope.organizationId,
          conversationId: message.conversationId,
          messageId: message.id,
          entityId: reference.id,
          entityType: reference.kind,
          purpose: "mention" as const,
          createdByActorEntityId: ctx.scope.actorEntityId,
        })),
      )
      .onConflictDoNothing();
    referenced = true;
  }
  if (message.threadId) {
    // Members who left get mention alerts only.
    const authors = await db
      .selectDistinct({ userId: actors.userId })
      .from(messagingMessages)
      .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
      .innerJoin(
        messagingParticipants,
        and(
          eq(messagingParticipants.conversationId, messagingMessages.conversationId),
          eq(messagingParticipants.actorEntityId, messagingMessages.authorActorEntityId),
        ),
      )
      .where(
        and(
          eq(messagingMessages.conversationId, message.conversationId),
          or(
            eq(messagingMessages.id, message.threadId),
            eq(messagingMessages.threadId, message.threadId),
          ),
          isNull(messagingParticipants.leftAt),
        ),
      );
    for (const author of authors)
      if (author.userId && !recipients.has(author.userId)) recipients.set(author.userId, "reply");
  }
  if (!scope.actorEntityId) recipients.delete(scope.userId);
  if (!recipients.size) return { referenced, notified: [] };
  const notified = await db.execute<{ organizationId: string; actorId: string }>(sql`
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
        AND ${messagingParticipants.actorEntityId} = ${actors.entityId}
      WHERE ${actors.disabledAt} IS NULL
        AND (${actors.organizationId} = ${conversationOrganizationId} OR ${messagingParticipants.actorEntityId} IS NOT NULL)
      ON CONFLICT DO NOTHING
      RETURNING organization_id AS "organizationId", recipient_actor_entity_id AS "actorId"
    `);
  return { referenced, notified: [...notified] };
}
