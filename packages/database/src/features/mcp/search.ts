import type { McpInput, McpOutput } from "@substrate/contracts/agent-tools/tools";

import { joinActorAccount } from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { searchDocument } from "../../core/search/indexing";
import type { SessionIdentity } from "../../core/session/identity";
import { containsText, matchesWords, wordPrefixQuery } from "../context/search";
import { visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { authorSelection } from "./authors";
import { excerpt, iso } from "./formatting";
import { recordsOfMessages } from "./links";
import { newest, newestFirstPagination } from "./pagination";
import { and, desc, eq, isNull, sql, type SQL, type SQLWrapper } from "drizzle-orm";

type Timestamp = Date | string;
type Page = ReturnType<typeof newestFirstPagination>;

/** Each type's query reads one page of rows older than the cursor, in the same order. */
function window(p: Page, time: SQL, id: SQLWrapper) {
  return {
    take: p.take,
    older: p.before
      ? sql`(${time}, ${id}) < (${p.before.at}::timestamptz, ${p.before.id}::uuid)`
      : undefined,
  };
}

/**
 * Merges newest-first rows of several types into one page. Each type's query already returned its
 * newest rows past the cursor, so the newest rows of the merge are the page.
 */
export async function newestPage<T extends { id: string; at: Timestamp }>(
  p: Page,
  branches: Promise<T[]>[],
) {
  const rows = (await Promise.all(branches))
    .flat()
    .map((row) => ({ id: row.id, ms: Date.parse(iso(row.at)), row }));
  // Ties fall back to ID, newest first like the SQL order. UUID text sorts like the UUID.
  rows.sort((a, b) => {
    if (a.ms !== b.ms) return b.ms - a.ms;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
  const page = p.page(rows, (row) => row);
  return { items: page.items.map(({ row }) => row), nextCursor: page.nextCursor };
}

/** Agent search: names and titles, or words in text. Each type is one small query. */
export function mcpSearchQueries(ctx: RepositoryContext, identity: SessionIdentity) {
  const { db, scope } = ctx;
  const updatedAt = newest(entities.updatedAt);
  const entityRow = (entityId: SQLWrapper) =>
    and(eq(entities.organizationId, scope.organizationId), eq(entities.entityId, entityId));

  const taskRows = (match: SQL, p: Page) => {
    const { take, older } = window(p, updatedAt, tasks.entityId);
    return db
      .select({
        id: tasks.entityId,
        title: tasks.title,
        projectId: tasks.projectEntityId,
        projectName: projects.name,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        at: updatedAt,
      })
      .from(tasks)
      .innerJoin(entities, entityRow(tasks.entityId))
      .innerJoin(
        projects,
        and(
          eq(projects.organizationId, tasks.organizationId),
          eq(projects.entityId, tasks.projectEntityId),
        ),
      )
      .where(
        and(
          eq(tasks.organizationId, scope.organizationId),
          ctx.readable(tasks.entityId),
          match,
          older,
        ),
      )
      .orderBy(desc(updatedAt), desc(tasks.entityId))
      .limit(take)
      .then((rows) => rows.map((row) => ({ ...row, type: "task" as const })));
  };

  const projectRows = (match: SQL, p: Page) => {
    const { take, older } = window(p, updatedAt, projects.entityId);
    return db
      .select({
        id: projects.entityId,
        title: projects.name,
        archived: sql<boolean>`${projects.archivedAt} IS NOT NULL`,
        at: updatedAt,
      })
      .from(projects)
      .innerJoin(entities, entityRow(projects.entityId))
      .where(
        and(
          eq(projects.organizationId, scope.organizationId),
          ctx.readable(projects.entityId),
          match,
          older,
        ),
      )
      .orderBy(desc(updatedAt), desc(projects.entityId))
      .limit(take)
      .then((rows) => rows.map((row) => ({ ...row, type: "project" as const })));
  };

  const conversationRows = (query: string, p: Page) => {
    const lastActivity = newest(
      sql`coalesce((select max(m.created_at) from ${messagingMessages} m
        where m.conversation_id = ${messagingConversations.id}), ${messagingConversations.createdAt})`,
    );
    const { take, older } = window(p, lastActivity, messagingConversations.id);
    return db
      .select({
        id: messagingConversations.id,
        title: sql<string>`${messagingConversations.name}`,
        kind: messagingConversations.kind,
        at: lastActivity,
      })
      .from(messagingConversations)
      .where(
        and(
          visibleConversations(db, identity),
          containsText(messagingConversations.name, query),
          older,
        ),
      )
      .orderBy(desc(lastActivity), desc(messagingConversations.id))
      .limit(take)
      .then((rows) => rows.map((row) => ({ ...row, type: "conversation" as const })));
  };

  const messageRows = (words: SQL, p: Page) => {
    const createdAt = newest(messagingMessages.createdAt);
    const { take, older } = window(p, createdAt, messagingMessages.id);
    return joinActorAccount(
      db
        .select({
          id: messagingMessages.id,
          conversationId: messagingMessages.conversationId,
          threadId: messagingMessages.threadId,
          author: authorSelection(identity.userId),
          body: messagingMessages.body,
          at: createdAt,
        })
        .from(messagingMessages)
        .innerJoin(
          messagingConversations,
          eq(messagingConversations.id, messagingMessages.conversationId),
        )
        .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
        .$dynamic(),
    )
      .where(
        and(
          visibleConversations(db, identity),
          isNull(messagingMessages.deletedAt),
          matchesWords(searchDocument(messagingMessages.body), words),
          older,
        ),
      )
      .orderBy(desc(createdAt), desc(messagingMessages.id))
      .limit(take)
      .then((rows) => rows.map((row) => ({ ...row, type: "message" as const })));
  };

  type Rows<F extends (...args: never[]) => Promise<unknown[]>> = Awaited<ReturnType<F>>[number];
  type WorkRow = Rows<typeof taskRows> | Rows<typeof projectRows>;

  return {
    async names(input: McpInput<"search_names">): Promise<McpOutput<"search_names">> {
      const p = newestFirstPagination(scope, "search_names", input);
      const wants = (type: NonNullable<typeof input.type>) => !input.type || input.type === type;
      const branches: Promise<(WorkRow | Rows<typeof conversationRows>)[]>[] = [];
      if (wants("task")) branches.push(taskRows(containsText(tasks.title, input.query), p));
      if (wants("project")) branches.push(projectRows(containsText(projects.name, input.query), p));
      if (wants("conversation")) branches.push(conversationRows(input.query, p));
      const page = await newestPage(p, branches);
      return {
        nextCursor: page.nextCursor,
        items: page.items.map(({ at, ...row }) =>
          row.type === "conversation"
            ? { ...row, lastActivityAt: iso(at) }
            : { ...row, updatedAt: iso(at) },
        ),
      };
    },
    async content(input: McpInput<"search_content">): Promise<McpOutput<"search_content">> {
      const p = newestFirstPagination(scope, "search_content", input);
      const words = wordPrefixQuery(input.query);
      const wants = (type: NonNullable<typeof input.type>) => !input.type || input.type === type;
      const branches: Promise<(WorkRow | Rows<typeof messageRows>)[]>[] = [];
      if (wants("task"))
        branches.push(
          taskRows(matchesWords(searchDocument(tasks.title, tasks.description), words), p),
        );
      if (wants("project"))
        branches.push(
          projectRows(matchesWords(searchDocument(projects.name, projects.description), words), p),
        );
      if (wants("message")) branches.push(messageRows(words, p));
      const page = await newestPage(p, branches);
      const records = await recordsOfMessages(
        ctx,
        page.items.flatMap((row) => (row.type === "message" ? [row.id] : [])),
      );
      return {
        nextCursor: page.nextCursor,
        items: page.items.map(({ at, ...row }) => {
          if (row.type !== "message") return { ...row, updatedAt: iso(at) };
          const { body, ...message } = row;
          return {
            ...message,
            ...excerpt(body, 300),
            createdAt: iso(at),
            records: records.get(row.id) ?? [],
          };
        }),
      };
    },
  };
}
