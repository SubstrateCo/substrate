import type { AgentCallMode } from "@substrate/contracts/agents";
import type { ContextSearchBatchKind, ContextSearchKind } from "@substrate/contracts/context/input";
import { managedPicture, managedPicturePath } from "@substrate/contracts/files/pictures";
import type { ConversationKind } from "@substrate/contracts/messaging/input";
import type { TaskStatus } from "@substrate/contracts/tasks";

import { joinActorAccount, joinedActorName } from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { contactInteractions } from "../../core/contacts/interactions.schema";
import { entities } from "../../core/entities/schema";
import { entityLinks } from "../../core/links/schema";
import { member } from "../../core/organizations/schema";
import { readableFromCte, withVisibility } from "../../core/permissions/visibility";
import { pageSize, type RepositoryContext } from "../../core/repository-context";
import { searchDocument, trigramKey } from "../../core/search/indexing";
import { AccessDeniedError } from "../../errors";
import {
  approvedParticipant,
  liveAgentMember,
  mentionablePerson,
  visibleConversations,
} from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../messaging/schema";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { requireWork } from "./access";
import { crmContextTargets, crmContextTypes } from "./crm-targets";
import { messageExcerpts } from "./message-excerpt";
import { bodyMessagingReferences } from "./messaging-references";
import { messageEntityReferences } from "./schema";
import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { alias, type PgSelectQueryBuilder } from "drizzle-orm/pg-core";

type ChannelMembership = "joined" | "left" | "none";
interface SearchResult {
  id: string;
  kind: Exclude<ContextSearchKind, "all">;
  title: string;
  image?: string | null;
  projectEntityId?: string;
  contactEntityId?: string;
  // Task results only: the readable parent project and the task's status, so pickers can tell
  // tasks with the same title apart.
  projectName?: string;
  status?: TaskStatus;
  conversationId?: string;
  threadId?: string | null;
  conversationName?: string;
  // Conversation results, and message and thread results for their conversation.
  conversationKind?: ConversationKind;
  // Message and thread results only: one line of plain text with references resolved for the
  // viewer, the author's name, and when it was sent.
  excerpt?: string;
  authorName?: string;
  createdAt?: Date;
  // Agent results only: the viewer's own agent definition.
  agentId?: string;
  // Agent results only: another person's agent that the viewer may call, and how.
  callMode?: AgentCallMode;
  // Conversation and channel results only.
  private?: boolean;
  membership?: ChannelMembership;
  memberCount?: number;
}

// Columns shared by thread and message results. Needs joinMessageConversationAndAuthor.
function messageResultColumns() {
  return {
    id: messagingMessages.id,
    title: messagingMessages.body,
    conversationId: messagingMessages.conversationId,
    conversationKind: messagingConversations.kind,
    private: messagingConversations.private,
    authorName: joinedActorName(),
    createdAt: messagingMessages.createdAt,
  };
}

function joinMessageConversationAndAuthor<T extends PgSelectQueryBuilder>(query: T) {
  return joinActorAccount(
    query
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingMessages.conversationId),
      )
      .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId)),
  );
}

// Case-insensitive substring match for short fields such as names and titles. Three or more
// characters can use the trigram index on lower(column); shorter queries scan.
function containsText(column: SQLWrapper, query: string) {
  if (query.length < 3) return sql`strpos(${trigramKey(column)}, lower(${query})) > 0`;
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  return sql`${trigramKey(column)} LIKE lower(${pattern})`;
}

// Every word of the query as a word prefix, for the word indexes. PostgreSQL splits the query with
// the expression that built the index, so both sides get the same words and punctuation separates
// them. A query with no words gives NULL, which matches nothing.
function wordPrefixQuery(query: string) {
  return sql`(
    SELECT string_agg('''' || replace(replace(lexeme, '\\', '\\\\'), '''', '''''') || ''':*', ' & ')::tsquery
    FROM (
      SELECT lexeme FROM unnest(${searchDocument(sql`${query}::text`)}) ORDER BY positions[1] LIMIT 16
    ) AS query_words
  )`;
}

function matchesWords(document: SQL, words: SQL) {
  return sql`${document} @@ ${words}`;
}

export async function contextSearch(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  input: {
    query: string;
    kind?: ContextSearchKind;
    after?: string;
    limit?: number;
    conversationId?: string;
    editable?: boolean;
    relatedToEntityId?: string;
    kinds?: readonly ContextSearchBatchKind[];
  },
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  signal?.throwIfAborted();
  const { db } = ctx;
  // The route and the MCP tool schemas validate the query and kind.
  const limit = pageSize(input.limit ?? 30);
  const query = input.query.trim();
  const kind = input.kind ?? "all";
  // A combined search names its kinds. Otherwise "all" covers every kind except people and agents.
  const searches = (type: ContextSearchBatchKind) =>
    input.kinds
      ? input.kinds.includes(type)
      : kind === type || (kind === "all" && type !== "person" && type !== "agent");
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
    signal?.throwIfAborted();
    if (!source) return [];
  }
  // One hop only. Membership stays structural; links never grant access.
  // The anchor can be an entity, a message, or a conversation ID.
  let anchorKind: "entity" | "message" | "conversation" | undefined;
  let anchorConversationId: string | undefined;
  // A task anchor's subtasks share its project, which bounds the scan by the unique index.
  let anchorProjectId: string | undefined;
  // A message anchor's channel and thread references, read from its body.
  let anchorReferences: ReturnType<typeof bodyMessagingReferences> = [];
  const anchorId = input.relatedToEntityId;
  if (anchorId) {
    const [entity] = await db
      .select({ entityType: entities.entityType })
      .from(entities)
      .where(
        and(eq(entities.organizationId, scope.organizationId), eq(entities.entityId, anchorId)),
      );
    signal?.throwIfAborted();
    if (entity) {
      if (entity.entityType === "task" || entity.entityType === "project")
        anchorProjectId = (await requireWork(ctx, anchorId)).projectEntityId;
      else await ctx.requireAccess(anchorId, "view");
      signal?.throwIfAborted();
      anchorKind = "entity";
    } else {
      const [conversation] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(and(eq(messagingConversations.id, anchorId), visibleConversations(db, scope)));
      signal?.throwIfAborted();
      if (conversation) {
        anchorKind = "conversation";
        anchorConversationId = conversation.id;
      } else {
        const [message] = await db
          .select({
            conversationId: messagingMessages.conversationId,
            body: messagingMessages.body,
          })
          .from(messagingMessages)
          .innerJoin(
            messagingConversations,
            eq(messagingConversations.id, messagingMessages.conversationId),
          )
          .where(and(eq(messagingMessages.id, anchorId), visibleConversations(db, scope)));
        signal?.throwIfAborted();
        if (!message) throw new AccessDeniedError();
        anchorKind = "message";
        anchorConversationId = message.conversationId;
        anchorReferences = bodyMessagingReferences(message.body);
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
        UNION SELECT ${messagingConversations.taskEntityId} FROM ${messagingConversations}
        WHERE ${messagingConversations.id} = ${anchorConversationId ?? null}::uuid
          AND ${messagingConversations.organizationId} = ${scope.organizationId}
          AND ${messagingConversations.taskEntityId} IS NOT NULL
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
      relatedConversations = or(
        eq(messagingConversations.taskEntityId, anchorId),
        inArray(
          messagingConversations.id,
          relatedReferenceIds(messageEntityReferences.conversationId),
        ),
      );
      relatedMessages = or(
        eq(messagingConversations.taskEntityId, anchorId),
        inArray(messagingMessages.id, relatedReferenceIds(messageEntityReferences.messageId)),
      );
    } else if (anchorKind === "message") {
      // Only the anchor's own outgoing references: references are not stored, so incoming ones
      // cannot be found without scanning message bodies.
      const ids = (kind: "channel" | "thread") =>
        anchorReferences.flatMap((reference) => (reference.kind === kind ? [reference.id] : []));
      const threadIds = ids("thread");
      relatedConversations = or(
        eq(messagingConversations.id, anchorConversationId!),
        ...ids("channel").map((id) => eq(messagingConversations.id, id)),
      );
      relatedMessages = threadIds.length ? inArray(messagingMessages.id, threadIds) : sql`false`;
    } else {
      relatedMessages = eq(messagingMessages.conversationId, anchorConversationId!);
    }
  }
  const words = wordPrefixQuery(query);
  const results: SearchResult[] = [];
  // Full message bodies by result ID, for excerpts.
  const bodies = new Map<string, string>();
  // Branches of kind "all" start here and run concurrently; their rows join `results` in order.
  const branchRows: Promise<SearchResult[]>[] = [];
  const entityTypes = (["task", "project", ...crmContextTypes] as const).filter(searches);
  if (entityTypes.length) {
    // Work and CRM records in one statement with one visibility CTE.
    const minimum = input.editable ? "edit" : "view";
    // The task's project already passed the readable check, so its name is safe to show.
    const taskProject = alias(projects, "task_project");
    const branches = entityTypes.map((type) => {
      let table, column, matches, active, projectEntityId;
      if (type === "task" || type === "project") {
        table = type === "task" ? tasks : projects;
        column = type === "task" ? tasks.title : projects.name;
        matches = or(
          containsText(column, query),
          matchesWords(searchDocument(column, table.description), words),
        );
        projectEntityId = type === "task" ? tasks.projectEntityId : projects.entityId;
      } else {
        ({ table, title: column, active } = crmContextTargets[type]);
        matches = containsText(column, query);
        projectEntityId = sql`NULL::uuid`;
      }
      const where = and(
        eq(table.organizationId, scope.organizationId),
        readableFromCte(ctx.scope, table.entityId, minimum),
        active,
        anchorId ? inArray(table.entityId, relatedEntities) : undefined,
        anchorId ? sql`${table.entityId} <> ${anchorId}` : undefined,
        query ? matches : undefined,
        input.after ? gt(table.entityId, input.after) : undefined,
      );
      const context =
        type === "task"
          ? sql`${taskProject.name} AS "projectName", ${tasks.status}::text AS status`
          : sql`NULL::text AS "projectName", NULL::text AS status`;
      const contactEntityId =
        type === "contact_interaction" ? contactInteractions.contactEntityId : sql`NULL::uuid`;
      const parent =
        type === "task"
          ? sql`LEFT JOIN ${projects} "task_project" ON ${taskProject.entityId} = ${tasks.projectEntityId}`
          : sql``;
      return sql`(SELECT ${table.entityId} AS id, ${column} AS title,
          ${projectEntityId} AS "projectEntityId", ${type} AS kind, ${context},
          ${contactEntityId} AS "contactEntityId"
          FROM ${table} ${parent} WHERE ${where} ORDER BY ${table.entityId} LIMIT ${limit})`;
    });
    const union = sql.join(branches, sql` UNION ALL `);
    branchRows.push(
      db
        .execute<{
          id: string;
          title: string;
          projectEntityId: string | null;
          kind: (typeof entityTypes)[number];
          projectName: string | null;
          status: TaskStatus | null;
          contactEntityId: string | null;
        }>(
          withVisibility(
            ctx.scope,
            input.kinds
              ? union
              : sql`SELECT * FROM (${union}) entity_results ORDER BY id LIMIT ${limit}`,
          ),
        )
        .then((rows) =>
          rows.map(({ projectEntityId, projectName, status, contactEntityId, ...row }) => {
            if (row.kind === "task")
              return {
                ...row,
                projectEntityId: projectEntityId!,
                projectName: projectName ?? undefined,
                status: status ?? undefined,
              };
            if (row.kind === "project") return { ...row, projectEntityId: projectEntityId! };
            const result: SearchResult = row;
            if (contactEntityId) result.contactEntityId = contactEntityId;
            return result;
          }),
        ),
    );
  }
  if (searches("conversation")) {
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
          query
            ? or(
                containsText(messagingConversations.name, query),
                exists(
                  db
                    .select({ id: tasks.entityId })
                    .from(tasks)
                    .where(
                      and(
                        eq(tasks.organizationId, messagingConversations.organizationId),
                        eq(tasks.entityId, messagingConversations.taskEntityId),
                        containsText(tasks.title, query),
                      ),
                    ),
                ),
              )
            : undefined,
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
    signal?.throwIfAborted();
    return rows.map((row) => ({ ...row, kind: "channel" as const, conversationId: row.id }));
  }
  if (kind === "thread") {
    const threads = db
      .select({
        ...messageResultColumns(),
        conversationName: sql<string>`${messagingConversations.name}`,
      })
      .from(messagingMessages)
      .$dynamic();
    const rows = await joinMessageConversationAndAuthor(threads)
      .where(
        and(
          visibleConversations(db, scope),
          eq(messagingConversations.organizationId, scope.organizationId),
          eq(messagingConversations.kind, "channel"),
          isNull(messagingMessages.threadId),
          isNull(messagingMessages.deletedAt),
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
    signal?.throwIfAborted();
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
  if (searches("message")) {
    const messages = db
      .select({
        ...messageResultColumns(),
        threadId: messagingMessages.threadId,
        conversationName: conversationDisplayName(db, scope),
      })
      .from(messagingMessages)
      .$dynamic();
    const pending = joinMessageConversationAndAuthor(messages)
      .where(
        and(
          visibleConversations(db, scope),
          relatedMessages,
          query ? matchesWords(searchDocument(messagingMessages.body), words) : undefined,
          isNull(messagingMessages.deletedAt),
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
  signal?.throwIfAborted();
  if (searches("person") && input.conversationId) {
    const rows = await db
      .select({
        id: actors.entityId,
        title: user.name,
        image: sql<
          string | null
        >`case when ${member.id} is not null then ${user.image} end`.mapWith(
          (value: string | null) => {
            const parsed = managedPicture.safeParse(value);
            return parsed.success ? parsed.data : null;
          },
        ),
      })
      .from(actors)
      .innerJoin(user, eq(user.id, actors.userId))
      .leftJoin(
        member,
        and(eq(member.userId, actors.userId), eq(member.organizationId, scope.organizationId)),
      )
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
    signal?.throwIfAborted();
    results.push(...rows.map((row) => ({ ...row, kind: "person" as const })));
  }
  // Mention picker: the viewer's own agents that are members here, and, for a person of this
  // organization in a channel or group, other people's agents that accept callers and whose owner
  // can see the conversation. Shared agents show their call mode, never their allowlist or
  // definition. Agents themselves never call other agents.
  if (searches("agent") && input.conversationId) {
    const shared = scope.actorEntityId
      ? undefined
      : and(
          sql`${userAgents.callerPolicy} <> 'owner'`,
          eq(actors.organizationId, scope.organizationId),
          inArray(messagingConversations.kind, ["channel", "group"]),
          exists(
            db
              .select({ id: member.id })
              .from(member)
              .where(
                and(
                  eq(member.userId, scope.userId),
                  eq(member.organizationId, scope.organizationId),
                ),
              ),
          ),
          visibleConversations(db, {
            userId: userAgents.userId,
            organizationId: scope.organizationId,
          }),
        );
    const rows = await db
      .select({
        id: actors.entityId,
        title: userAgents.name,
        ownerUserId: userAgents.userId,
        agentId: userAgents.id,
        callerPolicy: userAgents.callerPolicy,
        imageFileId: userAgents.imageFileId,
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
          shared
            ? or(eq(userAgents.userId, scope.userId), shared)
            : eq(userAgents.userId, scope.userId),
          query ? containsText(userAgents.name, query) : undefined,
          input.after ? gt(actors.entityId, input.after) : undefined,
        ),
      )
      .orderBy(asc(actors.entityId))
      .limit(limit);
    signal?.throwIfAborted();
    results.push(
      ...rows.map(({ ownerUserId, agentId, callerPolicy, imageFileId, ...row }) =>
        ownerUserId === scope.userId
          ? { ...row, image: managedPicturePath(imageFileId), agentId, kind: "agent" as const }
          : {
              ...row,
              image: null,
              // The shared condition admits only agents whose policy is anyone or ask.
              callMode: callerPolicy === "ask" ? ("ask" as const) : ("anyone" as const),
              kind: "agent" as const,
            },
      ),
    );
  }
  const byId = (a: SearchResult, b: SearchResult) => a.id.localeCompare(b.id);
  // A combined search keeps each kind's own page, grouped in the requested order.
  const page = input.kinds
    ? input.kinds.flatMap((type) => results.filter((row) => row.kind === type).sort(byId))
    : results.sort(byId).slice(0, limit);
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
    undefined,
    signal,
  );
  signal?.throwIfAborted();
  return page.map((row) => {
    const excerpt = excerpts.get(row.id);
    return excerpt === undefined ? row : { ...row, excerpt };
  });
}

import type { SessionIdentity } from "../../core/session/identity";
