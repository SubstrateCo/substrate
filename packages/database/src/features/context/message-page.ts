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
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const workByMessage = new Map<string, typeof work>();
  for (const link of work) {
    const links = workByMessage.get(link.messageId) ?? [];
    links.push(link);
    workByMessage.set(link.messageId, links);
  }
  const tokens = new Map<string, Set<string>>();
  const conversationTokens = new Map<string, Set<string>>();
  for (const message of messages) {
    const ids = new Set(
      messageReferences(message.body)
        .filter((item) => item.kind === "person")
        .map((item) => item.id),
    );
    tokens.set(message.id, ids);
    if (!ids.size) continue;
    const combined = conversationTokens.get(message.conversationId) ?? new Set<string>();
    for (const id of ids) combined.add(id);
    conversationTokens.set(message.conversationId, combined);
  }
  const people = conversationTokens.size
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
              ...[...conversationTokens].map(([conversationId, ids]) =>
                and(
                  eq(messagingConversations.id, conversationId),
                  inArray(actors.entityId, [...ids]),
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
  const peopleByConversation = new Map<string, Map<string, (typeof people)[number]>>();
  for (const person of people) {
    const members =
      peopleByConversation.get(person.conversationId) ?? new Map<string, (typeof people)[number]>();
    members.set(person.id, person);
    peopleByConversation.set(person.conversationId, members);
  }
  return ids.map((id) => {
    const message = messagesById.get(id)!;
    return {
      messageId: id,
      links: (workByMessage.get(id) ?? []).map((link) => ({
        entityId: link.entityId,
        entityType: link.entityType,
        title: link.title,
        projectEntityId: link.projectEntityId,
        status: link.status,
        purpose: link.purpose,
        canRemove: link.canRemove,
        statusName: link.status ? taskStatusLabels[link.status] : null,
      })),
      people: [...tokens.get(id)!].flatMap((personId) => {
        const person = peopleByConversation.get(message.conversationId)?.get(personId);
        return person ? [{ id: person.id, name: person.name }] : [];
      }),
    };
  });
}
