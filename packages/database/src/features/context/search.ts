import type { ContextSearchKind } from "@startup-os/contracts/context/input";
import type { TaskStatus } from "@startup-os/contracts/tasks";

import type { DatabaseExecutor } from "../../client";
import { actorDisplayName } from "../../core/actors/display-name";
import { actorPicture } from "../../core/actors/picture";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { entityLinks } from "../../core/links/schema";
import { adminOwnsCondition, visibilityCte } from "../../core/permissions/visibility";
import { pageSize } from "../../core/repository-context";
import { searchDocument, trigramKey } from "../../core/search/indexing";
import { AccessDeniedError } from "../../errors";
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
import { messageExcerpts } from "./message-excerpt";
import { messageEntityReferences, messageMessagingReferences } from "./schema";
import { and, asc, eq, gt, inArray, isNull, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type ChannelMembership = "joined" | "left" | "none";
interface SearchResult {
  id: string;
  kind: Exclude<ContextSearchKind, "all">;
  title: string;
  image?: string | null;
  projectEntityId?: string;
  // Task results only: the readable parent project and the task's status, so pickers can tell
  // tasks with the same title apart.
  projectName?: string;
  status?: TaskStatus;
  conversationId?: string;
  threadId?: string | null;
  conversationName?: string;
  // Conversation results, and message and thread results for their conversation.
  conversationKind?: "dm" | "group" | "channel";
  // Message and thread results only: one line of plain text with references resolved for the
  // viewer, the author's name, and when it was sent.
  excerpt?: string;
  authorName?: string;
  createdAt?: Date;
  // Agent results only: the viewer's own agent definition.
  agentId?: string;
  // Conversation and channel results only.
  private?: boolean;
  membership?: ChannelMembership;
  memberCount?: number;
}

// Case-insensitive substring match for short fields such as names and titles. Three or more
// characters can use the trigram index on lower(column); shorter queries scan.
function containsText(column: SQLWrapper, query: string) {
  if (query.length < 3) return sql`strpos(${trigramKey(column)}, lower(${query})) > 0`;
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  return sql`${trigramKey(column)} LIKE lower(${pattern})`;
}

// Every word of the query as a word prefix, for the word indexes. Punctuation separates words.
function wordPrefixQuery(query: string) {
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
    kind?: ContextSearchKind;
    after?: string;
    limit?: number;
    conversationId?: string;
    editable?: boolean;
    relatedToEntityId?: string;
  },
): Promise<SearchResult[]> {
  const { context: ctx } = await workspaceContext(db, scope);
  // The route and the MCP tool schemas validate the query and kind.
  const limit = pageSize(input.limit ?? 30);
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
  // A task anchor's subtasks share its project, which bounds the scan by the unique index.
  let anchorProjectId: string | undefined;
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
        anchorProjectId = (await requireWork(ctx, anchorId)).projectEntityId;
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
          AND ${anchorProjectId ? eq(tasks.projectEntityId, anchorProjectId) : sql`true`}
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
                eq(messageMessagingReferences.targetConversationId, anchorConversationId!),
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
  // Full message bodies by result ID, for excerpts.
  const bodies = new Map<string, string>();
  // Branches of kind "all" start here and run concurrently; their rows join `results` in order.
  const branchRows: Promise<SearchResult[]>[] = [];
  if (kind === "all" || kind === "task" || kind === "project") {
    // Tasks and projects in one statement with one visibility CTE. A task is readable when its
    // project is and the task is not deleted.
    const minimum = input.editable ? "edit" : "view";
    const readableProject = (entityId: SQLWrapper) =>
      sql`(${entityId} IN (SELECT entity_id FROM visible_entities WHERE level >= ${minimum}::permission_level)
        OR ${adminOwnsCondition(ctx.scope, entityId)})`;
    const types = kind === "all" ? (["task", "project"] as const) : [kind];
    // The task's project already passed the readable check, so its name is safe to show.
    const taskProject = alias(projects, "task_project");
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
      const context =
        type === "task"
          ? sql`${taskProject.name} AS "projectName", ${tasks.status}::text AS status`
          : sql`NULL::text AS "projectName", NULL::text AS status`;
      const parent =
        type === "task"
          ? sql`LEFT JOIN ${projects} "task_project" ON ${taskProject.entityId} = ${tasks.projectEntityId}`
          : sql``;
      return sql`(SELECT ${table.entityId} AS id, ${column} AS title,
          ${projectEntityId} AS "projectEntityId", ${type} AS kind, ${context}
          FROM ${table} ${parent} WHERE ${where} ORDER BY ${table.entityId} LIMIT ${limit})`;
    });
    branchRows.push(
      db
        .execute<{
          id: string;
          title: string;
          projectEntityId: string;
          kind: "task" | "project";
          projectName: string | null;
          status: TaskStatus | null;
        }>(sql`${visibilityCte(ctx.scope)} ${sql.join(branches, sql` UNION ALL `)}`)
        .then((rows) =>
          rows.map(({ projectName, status, ...row }) =>
            row.kind === "task"
              ? { ...row, projectName: projectName ?? undefined, status: status ?? undefined }
              : row,
          ),
        ),
    );
  }
  if (kind === "all" || kind === "conversation") {
    const pending = db
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
    branchRows.push(
      pending.then((rows) =>
        rows.map((row) => ({ ...row, kind: "conversation" as const, conversationId: row.id })),
      ),
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
        conversationKind: messagingConversations.kind,
        private: messagingConversations.private,
        authorName: actorDisplayName(),
        createdAt: messagingMessages.createdAt,
      })
      .from(messagingMessages)
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingMessages.conversationId),
      )
      .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
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
    for (const row of rows) bodies.set(row.id, row.title);
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
    const pending = db
      .select({
        id: messagingMessages.id,
        title: messagingMessages.body,
        conversationId: messagingMessages.conversationId,
        threadId: messagingMessages.threadId,
        conversationName: conversationDisplayName(db, scope),
        conversationKind: messagingConversations.kind,
        private: messagingConversations.private,
        authorName: actorDisplayName(),
        createdAt: messagingMessages.createdAt,
      })
      .from(messagingMessages)
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingMessages.conversationId),
      )
      .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
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
    branchRows.push(
      pending.then((rows) => {
        for (const row of rows) bodies.set(row.id, row.title);
        return rows.map((row) => ({
          ...row,
          title: row.title.slice(0, 160),
          kind: "message" as const,
        }));
      }),
    );
  }
  for (const rows of await Promise.all(branchRows)) results.push(...rows);
  if (kind === "person" && input.conversationId) {
    const rows = await db
      .select({ id: actors.entityId, title: user.name, image: actorPicture(scope) })
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
      .select({
        id: actors.entityId,
        title: userAgents.name,
        agentId: userAgents.id,
        image: actorPicture(scope),
      })
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
  const page = results.sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
  // Message rows passed the conversation check above, so their bodies may be quoted.
  const excerpts = await messageExcerpts(
    ctx,
    db,
    scope,
    page.flatMap((row) =>
      bodies.has(row.id)
        ? [{ id: row.id, body: bodies.get(row.id)!, conversationId: row.conversationId! }]
        : [],
    ),
  );
  return page.map((row) => {
    const excerpt = excerpts.get(row.id);
    return excerpt === undefined ? row : { ...row, excerpt };
  });
}
