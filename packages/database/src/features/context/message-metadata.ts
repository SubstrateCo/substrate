import { taskStatusLabels } from "@startup-os/contracts/tasks";

import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import { visibilityCte } from "../../core/permissions/visibility";
import type { RepositoryContext } from "../../core/repository-context";
import { visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations } from "../messaging/schema";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { messageReferences } from "./references";
import { messageEntityReferences } from "./schema";
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

// Callers authorize every message before resolving its metadata.
export async function messageWorkLinks(ctx: RepositoryContext, messageIds: string[]) {
  const work = await ctx.db
    .select({
      messageId: messageEntityReferences.messageId,
      entityId: messageEntityReferences.entityId,
      entityType: sql<"task" | "project">`${messageEntityReferences.entityType}`,
      title: sql<string>`coalesce(${tasks.title}, ${projects.name})`,
      projectEntityId: sql<string>`coalesce(${tasks.projectEntityId}, ${projects.entityId})`,
      status: tasks.status,
      purpose: messageEntityReferences.purpose,
      canRemove: sql<boolean>`${messageEntityReferences.purpose} = 'association' AND (
        ${messageEntityReferences.createdByActorEntityId} = ${ctx.scope.actorEntityId} OR
        ${messageEntityReferences.entityId} IN (${visibilityCte(ctx.scope)} SELECT entity_id FROM visible_entities WHERE level = 'owner')
      )`,
    })
    .from(messageEntityReferences)
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messageEntityReferences.conversationId),
    )
    .leftJoin(
      tasks,
      and(
        eq(tasks.entityId, messageEntityReferences.entityId),
        eq(messageEntityReferences.entityType, "task"),
      ),
    )
    .leftJoin(
      projects,
      and(
        eq(projects.entityId, messageEntityReferences.entityId),
        eq(messageEntityReferences.entityType, "project"),
      ),
    )
    .where(
      and(
        inArray(messageEntityReferences.messageId, messageIds),
        eq(messageEntityReferences.organizationId, ctx.scope.organizationId),
        eq(messagingConversations.organizationId, ctx.scope.organizationId),
        inArray(messageEntityReferences.entityId, ctx.readableEntities()),
        or(
          and(isNotNull(tasks.entityId), inArray(tasks.projectEntityId, ctx.readableEntities())),
          isNotNull(projects.entityId),
        ),
      ),
    )
    .orderBy(asc(messageEntityReferences.createdAt));
  type Link = Omit<(typeof work)[number], "messageId"> & { statusName: string | null };
  const byMessage = new Map<string, Link[]>();
  for (const { messageId, ...link } of work) {
    const links = byMessage.get(messageId) ?? [];
    links.push({ ...link, statusName: link.status ? taskStatusLabels[link.status] : null });
    byMessage.set(messageId, links);
  }
  return byMessage;
}

export async function messagePeople(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  messages: { id: string; body: string; conversationId: string }[],
) {
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
  return new Map(
    messages.map((message) => [
      message.id,
      [...tokens.get(message.id)!].flatMap((personId) => {
        const person = peopleByConversation.get(message.conversationId)?.get(personId);
        return person ? [{ id: person.id, name: person.name }] : [];
      }),
    ]),
  );
}
