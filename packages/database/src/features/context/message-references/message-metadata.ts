import { taskStatusLabels } from "@substrate/contracts/tasks";

import { activeActorCondition } from "../../../core/actors/access";
import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { user } from "../../../core/authentication/schema";
import { contactInteractions } from "../../../core/contacts/interactions/interactions.schema";
import { contacts } from "../../../core/contacts/schema";
import { entities } from "../../../core/entities/schema";
import type { DatabaseExecutor } from "../../../core/executor";
import type { RepositoryContext } from "../../../core/repository-context";
import type { SessionIdentity } from "../../../core/session/identity";
import { messageReferences } from "../../../core/text/references";
import { crmAccounts, crmDeals } from "../../crm/schema";
import { mentionablePerson, visibleConversations } from "../../messaging/access";
import {
  messagingConversations,
  messagingMessages,
  messagingReactions,
} from "../../messaging/schema";
import { projects } from "../../projects/schema";
import { tasks } from "../../tasks/tasks.schema";
import { messageEntityReferences } from "../schema";
import { referenceArchived } from "./reference-archive";
import { and, asc, eq, exists, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";

// Callers authorize every message before resolving its metadata.
export async function messageWorkLinks(ctx: RepositoryContext, messageIds: string[]) {
  // A task inherits its project's level, which decides removal rights.
  const projectEntityId = sql`coalesce(${tasks.projectEntityId}, ${projects.entityId})`;
  const title = sql<string>`coalesce(${tasks.title}, ${projects.name}, ${contacts.displayName}, ${crmAccounts.name}, ${crmDeals.title}, ${contactInteractions.summary})`;
  const work = await ctx.db
    .select({
      messageId: messageEntityReferences.messageId,
      entityId: messageEntityReferences.entityId,
      entityType: messageEntityReferences.entityType,
      title,
      projectEntityId: sql<string | null>`${projectEntityId}`,
      contactEntityId: contactInteractions.contactEntityId,
      status: tasks.status,
      purpose: messageEntityReferences.purpose,
      canRemove: sql<boolean>`(${messagingConversations.taskEntityId} IS NULL OR
        ${ctx.readable(messagingConversations.taskEntityId, "comment")})
        AND NOT ${referenceArchived(messageEntityReferences.organizationId, messageEntityReferences.entityId, messagingConversations.taskEntityId)}
        AND ${messageEntityReferences.purpose} = 'association' AND (
        ${messageEntityReferences.createdByActorEntityId} = ${ctx.scope.actorEntityId} OR
        work_access.level = 'owner'
      )`,
    })
    .from(messageEntityReferences)
    .innerJoin(
      messagingMessages,
      and(
        eq(messagingMessages.id, messageEntityReferences.messageId),
        isNull(messagingMessages.deletedAt),
      ),
    )
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
    .leftJoin(
      contacts,
      and(
        eq(contacts.entityId, messageEntityReferences.entityId),
        eq(messageEntityReferences.entityType, "contact"),
      ),
    )
    .leftJoin(
      crmAccounts,
      and(
        eq(crmAccounts.entityId, messageEntityReferences.entityId),
        eq(messageEntityReferences.entityType, "account"),
      ),
    )
    .leftJoin(
      crmDeals,
      and(
        eq(crmDeals.entityId, messageEntityReferences.entityId),
        eq(messageEntityReferences.entityType, "deal"),
      ),
    )
    .leftJoin(
      contactInteractions,
      and(
        eq(contactInteractions.entityId, messageEntityReferences.entityId),
        eq(messageEntityReferences.entityType, "contact_interaction"),
      ),
    )
    // A page has few references, so each walks up from its entity instead of reading the
    // caller's whole visible set.
    .innerJoin(
      sql`LATERAL (SELECT ${ctx.accessLevel(messageEntityReferences.entityId)} AS level) work_access`,
      sql`work_access.level IS NOT NULL`,
    )
    .where(
      and(
        inArray(messageEntityReferences.messageId, messageIds),
        eq(messageEntityReferences.organizationId, ctx.scope.organizationId),
        eq(messagingConversations.organizationId, ctx.scope.organizationId),
        isNotNull(title),
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

// Mentioned IDs per message, and their union per conversation for messages that mention any.
function collectMentions(
  messages: { id: string; body: string; conversationId: string }[],
  kind: "person" | "agent",
) {
  const tokens = new Map<string, Set<string>>();
  const conversationTokens = new Map<string, Set<string>>();
  for (const message of messages) {
    const ids = new Set(
      messageReferences(message.body)
        .filter((item) => item.kind === kind)
        .map((item) => item.id),
    );
    tokens.set(message.id, ids);
    if (!ids.size) continue;
    const combined = conversationTokens.get(message.conversationId) ?? new Set<string>();
    for (const id of ids) combined.add(id);
    conversationTokens.set(message.conversationId, combined);
  }
  return { tokens, conversationTokens };
}

export async function messagePeople(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  messages: { id: string; body: string; conversationId: string }[],
) {
  const { tokens, conversationTokens } = collectMentions(messages, "person");
  const people = conversationTokens.size
    ? await db
        .select({
          id: actors.entityId,
          name: user.name,
          conversationId: messagingConversations.id,
        })
        .from(actors)
        .innerJoin(user, eq(user.id, actors.userId))
        .innerJoin(entities, eq(entities.entityId, actors.entityId))
        .innerJoin(
          messagingConversations,
          or(
            ...[...conversationTokens].map(([conversationId, ids]) =>
              and(
                eq(messagingConversations.id, conversationId),
                inArray(actors.entityId, [...ids]),
              ),
            ),
          ),
        )
        .where(mentionablePerson(db, scope.organizationId))
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

/**
 * Mentioned agents, under the rule that resolves a conversation's profiles: the agent wrote or
 * reacted in the conversation, or it is an active agent of the viewer's workspace whose owner sees
 * the conversation, and the viewer owns it. Callers authorize every message.
 */
export async function messageAgents(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  messages: { id: string; body: string; conversationId: string }[],
) {
  const { tokens, conversationTokens } = collectMentions(messages, "agent");
  const agents = conversationTokens.size
    ? await db
        .select({
          id: actors.entityId,
          name: sql<string>`coalesce(${userAgents.name}, 'Agent')`,
          conversationId: messagingConversations.id,
        })
        .from(actors)
        .innerJoin(entities, eq(entities.entityId, actors.entityId))
        .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
        .innerJoin(
          messagingConversations,
          or(
            ...[...conversationTokens].map(([conversationId, ids]) =>
              and(
                eq(messagingConversations.id, conversationId),
                inArray(actors.entityId, [...ids]),
              ),
            ),
          ),
        )
        .where(
          and(
            eq(actors.type, "agent"),
            or(
              exists(
                db
                  .select({ id: messagingReactions.actorEntityId })
                  .from(messagingReactions)
                  .where(
                    and(
                      eq(messagingReactions.conversationId, messagingConversations.id),
                      eq(messagingReactions.actorEntityId, actors.entityId),
                    ),
                  ),
              ),
              exists(
                db
                  .select({ id: messagingMessages.id })
                  .from(messagingMessages)
                  .where(
                    and(
                      eq(messagingMessages.conversationId, messagingConversations.id),
                      eq(messagingMessages.authorActorEntityId, actors.entityId),
                    ),
                  ),
              ),
              and(
                eq(actors.organizationId, scope.organizationId),
                eq(userAgents.userId, scope.userId),
                activeActorCondition(),
                isNull(entities.deletedAt),
                visibleConversations(db, {
                  userId: userAgents.userId,
                  organizationId: scope.organizationId,
                }),
              ),
            ),
          ),
        )
    : [];
  const agentsByConversation = new Map<string, Map<string, (typeof agents)[number]>>();
  for (const agent of agents) {
    const found =
      agentsByConversation.get(agent.conversationId) ?? new Map<string, (typeof agents)[number]>();
    found.set(agent.id, agent);
    agentsByConversation.set(agent.conversationId, found);
  }
  return new Map(
    messages.map((message) => [
      message.id,
      [...tokens.get(message.id)!].flatMap((agentId) => {
        const agent = agentsByConversation.get(message.conversationId)?.get(agentId);
        return agent ? [{ id: agent.id, name: agent.name }] : [];
      }),
    ]),
  );
}
