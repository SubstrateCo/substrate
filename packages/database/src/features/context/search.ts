import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { entityLinks } from "../../core/links/schema";
import { adminOwnsCondition, visibilityCte } from "../../core/permissions/visibility";
import { pageSize } from "../../core/repository-context";
import { searchDocument, trigramKey } from "../../core/search/indexing";
import { AccessDeniedError, ValidationError } from "../../errors";
import {
  approvedParticipant,
  liveAgentMember,
  mentionablePerson,
  visibleConversations,
  type MessagingIdentity,
} from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../messaging/schema";
import { projects } from "../projects/schema";
import { liveTask } from "../tasks/access";
import { tasks } from "../tasks/tasks.schema";
import { workspaceContext, requireWork } from "./access";
import { messageEntityReferences, messageMessagingReferences } from "./schema";
import { and, asc, eq, gt, inArray, isNull, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export type SearchKind =
  | "all"
  | "task"
  | "project"
  | "message"
  | "conversation"
  | "person"
  | "agent"
  | "channel"
  | "thread";
export type ChannelMembership = "joined" | "left" | "none";
interface SearchResult {
  id: string;
  kind: Exclude<SearchKind, "all">;
  title: string;
  projectEntityId?: string;
  conversationId?: string;
  threadId?: string | null;
  conversationName?: string;
  // Conversation results only.
  conversationKind?: "dm" | "group" | "channel";
  // Agent results only: the viewer's own agent definition.
  agentId?: string;
  // Conversation and channel results only.
  private?: boolean;
  membership?: ChannelMembership;
  memberCount?: number;
}

// Case-insensitive substring match for short fields such as names and titles. Three or more
// characters can use the trigram index on lower(column); shorter queries scan.
export function containsText(column: SQLWrapper, query: string) {
  if (query.length < 3) return sql`strpos(${trigramKey(column)}, lower(${query})) > 0`;
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  return sql`${trigramKey(column)} LIKE lower(${pattern})`;
}

// Every word of the query as a word prefix, for the word indexes. Punctuation separates words.
export function wordPrefixQuery(query: string) {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .slice(0, 16)
    .map((word) => `${word}:*`)
    .join(" & ");
}

function matchesWords(document: SQL, words: string) {
  return words ? sql`${document} @@ to_tsquery('simple', ${words})` : sql`false`;
}

export async function contextSearch(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  input: {
    query: string;
    kind?: SearchKind;
    after?: string;
    limit?: number;
    conversationId?: string;
    editable?: boolean;
    relatedToEntityId?: string;
  },
): Promise<SearchResult[]> {
  const { context: ctx } = await workspaceContext(db, scope);
  const limit = pageSize(input.limit ?? 30);
  if (
    input.query.length > 200 ||
    ![
      "all",
      "task",
      "project",
      "message",
      "conversation",
      "person",
      "agent",
      "channel",
      "thread",
    ].includes(input.kind ?? "all")
  )
    throw new ValidationError("Invalid search.");
  const query = input.query.trim();
  const kind = input.kind ?? "all";
  if ((kind === "channel" || kind === "thread") && input.conversationId) {
    const [source] = await db
      .select({ id: messagingConversations.id })
      .from(messagingConversations)
      .where(
        and(
          eq(messagingConversations.id, input.conversationId),
          eq(messagingConversations.organizationId, scope.organizationId),
          visibleConversations(db, scope),
        ),
      );
    if (!source) return [];
  }
  // One hop only. Membership stays structural; links never grant access.
  // The anchor can be an entity, a message, or a conversation ID.
  let anchorKind: "entity" | "message" | "conversation" | undefined;
  let anchorConversationId: string | undefined;
  const anchorId = input.relatedToEntityId;
  if (anchorId) {
    const [entity] = await db
      .select({ entityType: entities.entityType })
      .from(entities)
      .where(
        and(eq(entities.organizationId, scope.organizationId), eq(entities.entityId, anchorId)),
      );
    if (entity) {
      if (entity.entityType === "task" || entity.entityType === "project")
        await requireWork(ctx, anchorId);
      else await ctx.requireAccess(anchorId, "view");
      anchorKind = "entity";
    } else {
      const [conversation] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(and(eq(messagingConversations.id, anchorId), visibleConversations(db, scope)));
      if (conversation) {
        anchorKind = "conversation";
        anchorConversationId = conversation.id;
      } else {
        const [message] = await db
          .select({ conversationId: messagingMessages.conversationId })
          .from(messagingMessages)
          .innerJoin(
            messagingConversations,
            eq(messagingConversations.id, messagingMessages.conversationId),
          )
          .where(and(eq(messagingMessages.id, anchorId), visibleConversations(db, scope)));
        if (!message) throw new AccessDeniedError();
        anchorKind = "message";
        anchorConversationId = message.conversationId;
      }
    }
  }
  const relatedEntities =
    anchorKind === "entity"
      ? sql`(
        SELECT CASE WHEN ${entityLinks.sourceEntityId} = ${anchorId}
          THEN ${entityLinks.targetEntityId} ELSE ${entityLinks.sourceEntityId} END
        FROM ${entityLinks}
        WHERE ${entityLinks.organizationId} = ${scope.organizationId}
          AND (${entityLinks.sourceEntityId} = ${anchorId} OR ${entityLinks.targetEntityId} = ${anchorId})
        UNION SELECT ${tasks.entityId} FROM ${tasks}
        WHERE ${tasks.organizationId} = ${scope.organizationId}
          AND (${tasks.projectEntityId} = ${anchorId} OR ${tasks.parentTaskEntityId} = ${anchorId})
        UNION SELECT ${tasks.projectEntityId} FROM ${tasks}
        WHERE ${tasks.organizationId} = ${scope.organizationId} AND ${tasks.entityId} = ${anchorId}
        UNION SELECT ${tasks.parentTaskEntityId} FROM ${tasks}
        WHERE ${tasks.organizationId} = ${scope.organizationId} AND ${tasks.entityId} = ${anchorId}
      )`
      : sql`(SELECT ${messageEntityReferences.entityId} FROM ${messageEntityReferences}
        WHERE ${messageEntityReferences.organizationId} = ${scope.organizationId}
          AND ${
            anchorKind === "message"
              ? eq(messageEntityReferences.messageId, anchorId!)
              : eq(messageEntityReferences.conversationId, anchorId!)
          }
      )`;
  const relatedReferenceIds = (column: SQLWrapper) => sql`(
    SELECT ${column} FROM ${messageEntityReferences}
    WHERE ${messageEntityReferences.organizationId} = ${scope.organizationId}
      AND ${messageEntityReferences.entityId} = ${anchorId}
  )`;
  let relatedConversations: SQL | undefined;
  let relatedMessages: SQL | undefined;
  if (anchorId) {
    relatedConversations = sql`false`;
    relatedMessages = sql`false`;
    if (anchorKind === "entity") {
      relatedConversations = inArray(
        messagingConversations.id,
        relatedReferenceIds(messageEntityReferences.conversationId),
      );
      relatedMessages = inArray(
        messagingMessages.id,
        relatedReferenceIds(messageEntityReferences.messageId),
      );
    } else if (anchorKind === "message") {
      relatedConversations = or(
        eq(messagingConversations.id, anchorConversationId!),
        inArray(
          messagingConversations.id,
          db
            .select({ id: messageMessagingReferences.targetConversationId })
            .from(messageMessagingReferences)
            .where(
              and(
                eq(messageMessagingReferences.organizationId, scope.organizationId),
                eq(messageMessagingReferences.messageId, anchorId),
              ),
            ),
        ),
      );
      relatedMessages = or(
        inArray(
          messagingMessages.id,
          db
            .select({ id: messageMessagingReferences.messageId })
            .from(messageMessagingReferences)
            .where(
              and(
                eq(messageMessagingReferences.organizationId, scope.organizationId),
                eq(messageMessagingReferences.targetThreadId, anchorId),
              ),
            ),
        ),
        inArray(
          messagingMessages.id,
          db
            .select({ id: messageMessagingReferences.targetThreadId })
            .from(messageMessagingReferences)
            .where(
              and(
                eq(messageMessagingReferences.organizationId, scope.organizationId),
                eq(messageMessagingReferences.messageId, anchorId),
              ),
            ),
        ),
      );
    } else {
      relatedMessages = or(
        eq(messagingMessages.conversationId, anchorConversationId!),
        inArray(
          messagingMessages.id,
          db
            .select({ id: messageMessagingReferences.messageId })
            .from(messageMessagingReferences)
            .where(
              and(
                eq(messageMessagingReferences.organizationId, scope.organizationId),
                eq(messageMessagingReferences.targetConversationId, anchorConversationId!),
              ),
            ),
        ),
      );
    }
  }
  const words = wordPrefixQuery(query);
  const results: SearchResult[] = [];
  if (kind === "all" || kind === "task" || kind === "project") {
    // Tasks and projects in one statement with one visibility CTE. A task is readable when its
    // project is and the task is not deleted.
    const minimum = input.editable ? "edit" : "view";
    const readableProject = (entityId: SQLWrapper) =>
      sql`(${entityId} IN (SELECT entity_id FROM visible_entities WHERE level >= ${minimum}::permission_level)
        OR ${adminOwnsCondition(ctx.scope, entityId)})`;
    const types = kind === "all" ? (["task", "project"] as const) : [kind];
    const branches = types.map((type) => {
      const table = type === "task" ? tasks : projects;
      const column = type === "task" ? tasks.title : projects.name;
      const projectEntityId = type === "task" ? tasks.projectEntityId : projects.entityId;
      const where = and(
        eq(table.organizationId, scope.organizationId),
        readableProject(projectEntityId),
        type === "task" ? liveTask() : undefined,
        anchorId ? inArray(table.entityId, relatedEntities) : undefined,
        anchorId ? sql`${table.entityId} <> ${anchorId}` : undefined,
        query
          ? or(
              containsText(column, query),
              matchesWords(searchDocument(column, table.description), words),
            )
          : undefined,
        input.after ? gt(table.entityId, input.after) : undefined,
      );
      return sql`(SELECT ${table.entityId} AS id, ${column} AS title,
          ${projectEntityId} AS "projectEntityId", ${type} AS kind
          FROM ${table} WHERE ${where} ORDER BY ${table.entityId} LIMIT ${limit})`;
    });
    const rows = await db.execute<{
      id: string;
      title: string;
      projectEntityId: string;
      kind: "task" | "project";
    }>(sql`${visibilityCte(ctx.scope)} ${sql.join(branches, sql` UNION ALL `)}`);
    results.push(...rows);
  }
  if (kind === "all" || kind === "conversation") {
    const rows = await db
      .select({
        id: messagingConversations.id,
        title: conversationDisplayName(db, scope),
        conversationKind: messagingConversations.kind,
        private: messagingConversations.private,
      })
      .from(messagingConversations)
      .where(
        and(
          visibleConversations(db, scope),
          relatedConversations,
          query ? containsText(messagingConversations.name, query) : undefined,
          input.after ? gt(messagingConversations.id, input.after) : undefined,
        ),
      )
      .orderBy(asc(messagingConversations.id))
      .limit(limit);
    results.push(
      ...rows.map((row) => ({ ...row, kind: "conversation" as const, conversationId: row.id })),
    );
  }
  // Channel browse and the channel reference picker. Ordered by name; the cursor is the last ID.
  if (kind === "channel") {
    const me = alias(messagingParticipants, "me");
    const nameKey = sql`(lower(${messagingConversations.name}), ${messagingConversations.id})`;
    const rows = await db
      .select({
        id: messagingConversations.id,
        title: sql<string>`${messagingConversations.name}`,
        private: messagingConversations.private,
        membership: sql<ChannelMembership>`case when ${me.actorEntityId} is null then 'none'
          when ${me.leftAt} is null then 'joined' else 'left' end`,
        memberCount: sql<number>`(select count(*)::int from ${messagingParticipants}
          where ${messagingParticipants.conversationId} = ${messagingConversations.id}
             and ${messagingParticipants.leftAt} is null and ${approvedParticipant(db)})`,
      })
      .from(messagingConversations)
      .leftJoin(
        me,
        and(
          eq(me.conversationId, messagingConversations.id),
          eq(me.organizationId, scope.organizationId),
          inArray(
            me.actorEntityId,
            db
              .select({ id: actors.entityId })
              .from(actors)
              .where(and(eq(actors.userId, scope.userId), eq(actors.type, "human"))),
          ),
        ),
      )
      .where(
        and(
          visibleConversations(db, scope),
          eq(messagingConversations.kind, "channel"),
          eq(messagingConversations.organizationId, scope.organizationId),
          relatedConversations,
          query ? containsText(messagingConversations.name, query) : undefined,
          input.after
            ? sql`${nameKey} > (select lower(a.name), a.id from ${messagingConversations} a where a.id = ${input.after}::uuid)`
            : undefined,
        ),
      )
      .orderBy(sql`lower(${messagingConversations.name})`, asc(messagingConversations.id))
      .limit(limit);
    return rows.map((row) => ({ ...row, kind: "channel" as const, conversationId: row.id }));
  }
  if (kind === "thread") {
    const rows = await db
      .select({
        id: messagingMessages.id,
        title: messagingMessages.body,
        conversationId: messagingMessages.conversationId,
        conversationName: sql<string>`${messagingConversations.name}`,
      })
      .from(messagingMessages)
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingMessages.conversationId),
      )
      .where(
        and(
          visibleConversations(db, scope),
          eq(messagingConversations.organizationId, scope.organizationId),
          eq(messagingConversations.kind, "channel"),
          isNull(messagingMessages.threadId),
          sql`exists (select 1 from messaging_messages replies where replies.conversation_id = ${messagingMessages.conversationId} and replies.thread_id = ${messagingMessages.id})`,
          relatedMessages,
          query
            ? or(
                matchesWords(searchDocument(messagingMessages.body), words),
                containsText(messagingConversations.name, query),
                sql`exists (
          select 1 from messaging_messages replies where replies.conversation_id = ${messagingMessages.conversationId}
            and replies.thread_id = ${messagingMessages.id} and ${matchesWords(searchDocument(sql`replies.body`), words)}
        )`,
              )
            : undefined,
          input.after ? gt(messagingMessages.id, input.after) : undefined,
        ),
      )
      .orderBy(asc(messagingMessages.id))
      .limit(limit);
    results.push(
      ...rows.map((row) => ({
        ...row,
        title: row.title.slice(0, 160),
        kind: "thread" as const,
        threadId: row.id,
      })),
    );
  }
  if (kind === "all" || kind === "message") {
    const rows = await db
      .select({
        id: messagingMessages.id,
        title: messagingMessages.body,
        conversationId: messagingMessages.conversationId,
        threadId: messagingMessages.threadId,
      })
      .from(messagingMessages)
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingMessages.conversationId),
      )
      .where(
        and(
          visibleConversations(db, scope),
          relatedMessages,
          query ? matchesWords(searchDocument(messagingMessages.body), words) : undefined,
          input.after ? gt(messagingMessages.id, input.after) : undefined,
        ),
      )
      .orderBy(asc(messagingMessages.id))
      .limit(limit);
    results.push(
      ...rows.map((row) => ({ ...row, title: row.title.slice(0, 160), kind: "message" as const })),
    );
  }
  if (kind === "person" && input.conversationId) {
    const rows = await db
      .select({ id: actors.entityId, title: user.name })
      .from(actors)
      .innerJoin(user, eq(user.id, actors.userId))
      .innerJoin(entities, eq(entities.entityId, actors.entityId))
      .innerJoin(
        messagingConversations,
        and(eq(messagingConversations.id, input.conversationId), visibleConversations(db, scope)),
      )
      .where(
        and(
          mentionablePerson(db, scope.organizationId),
          anchorId ? inArray(actors.entityId, relatedEntities) : undefined,
          anchorId ? ctx.readable(actors.entityId) : undefined,
          eq(user.emailVerified, true),
          query ? containsText(user.name, query) : undefined,
          input.after ? gt(actors.entityId, input.after) : undefined,
        ),
      )
      .orderBy(asc(actors.entityId))
      .limit(limit);
    results.push(...rows.map((row) => ({ ...row, kind: "person" as const })));
  }
  // Mention picker: only the caller's own agents that are members here. Other people's agents
  // stay private and cannot be addressed.
  if (kind === "agent" && input.conversationId) {
    const rows = await db
      .select({ id: actors.entityId, title: userAgents.name, agentId: userAgents.id })
      .from(messagingParticipants)
      .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
      .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
      .innerJoin(
        messagingConversations,
        and(
          eq(messagingConversations.id, messagingParticipants.conversationId),
          visibleConversations(db, scope),
        ),
      )
      .where(
        and(
          liveAgentMember(input.conversationId),
          eq(userAgents.userId, scope.userId),
          query ? containsText(userAgents.name, query) : undefined,
          input.after ? gt(actors.entityId, input.after) : undefined,
        ),
      )
      .orderBy(asc(actors.entityId))
      .limit(limit);
    results.push(...rows.map((row) => ({ ...row, kind: "agent" as const })));
  }
  return results.sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
}
