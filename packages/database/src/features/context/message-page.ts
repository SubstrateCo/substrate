import { taskStatusLabels } from "@startup-os/contracts/tasks";

import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import { visibilityCte } from "../../core/permissions/visibility";
import { AccessDeniedError, ValidationError } from "../../errors";
import { visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { workspaceContext } from "./access";
import { messageReferences } from "./references";
import { messageEntityReferences as references } from "./schema";
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

export async function messagePage(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  messageIds: string[],
) {
  if (messageIds.length > 50) throw new ValidationError("At most 50 messages are allowed.");
  const ctx = await workspaceContext(db, scope);
  const ids = [...new Set(messageIds)];
  if (!ids.length) return [];
  const messages = await db
    .select({
      id: messagingMessages.id,
      body: messagingMessages.body,
      conversationId: messagingMessages.conversationId,
    })
    .from(messagingMessages)
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messagingMessages.conversationId),
    )
    .where(and(inArray(messagingMessages.id, ids), visibleConversations(db, scope)));
  // Reject the whole page before resolving any metadata if even one message is unavailable.
  if (messages.length !== ids.length) throw new AccessDeniedError();
  const work = await db
    .select({
      messageId: references.messageId,
      entityId: references.entityId,
      entityType: sql<"task" | "project">`${references.entityType}`,
      title: sql<string>`coalesce(${tasks.title}, ${projects.name})`,
      projectEntityId: sql<string>`coalesce(${tasks.projectEntityId}, ${projects.entityId})`,
      status: tasks.status,
      purpose: references.purpose,
      canRemove: sql<boolean>`${references.purpose} = 'association' AND (
        ${references.createdByActorEntityId} = ${ctx.scope.actorEntityId} OR
        ${references.entityId} IN (${visibilityCte(ctx.scope)} SELECT entity_id FROM visible_entities WHERE level = 'owner')
      )`,
    })
    .from(references)
    .innerJoin(messagingConversations, eq(messagingConversations.id, references.conversationId))
    .leftJoin(
      tasks,
      and(eq(tasks.entityId, references.entityId), eq(references.entityType, "task")),
    )
    .leftJoin(
      projects,
      and(eq(projects.entityId, references.entityId), eq(references.entityType, "project")),
    )
    .where(
      and(
        inArray(references.messageId, ids),
        eq(references.organizationId, scope.organizationId),
        eq(messagingConversations.organizationId, scope.organizationId),
        inArray(references.entityId, ctx.readableEntities()),
        or(
          and(isNotNull(tasks.entityId), inArray(tasks.projectEntityId, ctx.readableEntities())),
          isNotNull(projects.entityId),
        ),
      ),
    )
    .orderBy(asc(references.createdAt));
  const tokens = new Map(
    messages.map((message) => [
      message.id,
      messageReferences(message.body)
        .filter((item) => item.kind === "person")
        .map((item) => item.id),
    ]),
  );
  const people = [...tokens.values()].some((ids) => ids.length > 0)
    ? await db
        .select({
          id: actors.entityId,
          name: actors.name,
          conversationId: messagingConversations.id,
        })
        .from(actors)
        .innerJoin(entities, eq(entities.entityId, actors.entityId))
        .innerJoin(
          messagingConversations,
          and(
            or(
              ...messages.map((message) =>
                and(
                  eq(messagingConversations.id, message.conversationId),
                  inArray(actors.entityId, tokens.get(message.id)!),
                ),
              ),
            ),
            visibleConversations(db, {
              userId: actors.userId,
              organizationId: scope.organizationId,
            }),
          ),
        )
        .where(
          and(
            eq(actors.organizationId, scope.organizationId),
            isNotNull(actors.userId),
            activeActorCondition(),
            isNull(entities.deletedAt),
          ),
        )
    : [];
  return ids.map((id) => {
    const message = messages.find((row) => row.id === id)!;
    return {
      messageId: id,
      links: work
        .filter((row) => row.messageId === id)
        .map((link) => ({
          entityId: link.entityId,
          entityType: link.entityType,
          title: link.title,
          projectEntityId: link.projectEntityId,
          status: link.status,
          purpose: link.purpose,
          canRemove: link.canRemove,
          statusName: link.status ? taskStatusLabels[link.status] : null,
        })),
      people: people
        .filter(
          (person) =>
            person.conversationId === message.conversationId && tokens.get(id)!.includes(person.id),
        )
        .map(({ id, name }) => ({ id, name })),
    };
  });
}
