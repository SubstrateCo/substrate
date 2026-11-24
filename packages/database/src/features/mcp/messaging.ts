import type { McpInput, McpOutput } from "@substrate/contracts/harness/tools";

import { joinActorAccount } from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { requireMessage, visibleConversations } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { authorSelection } from "./authors";
import { excerpt, iso } from "./formatting";
import { recordsOfMessages } from "./links";
import { newest, newestFirstPagination, olderThan, pagination, position } from "./pagination";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

export function mcpMessagingQueries(ctx: RepositoryContext, identity: SessionIdentity) {
  const { db, scope } = ctx;
  const replies = (rest: SQL = sql``) =>
    sql`from ${messagingMessages} r where r.conversation_id = ${messagingMessages.conversationId} and r.thread_id = ${messagingMessages.id} ${rest}`;
  const replyCount = sql<number>`(select count(*)::int ${replies()})`;
  const lastReplyAt = sql<string | null>`(select max(r.created_at)::text ${replies()})`;
  return {
    // New messages move a conversation to the top while the agent pages. Pages continue from the
    // last conversation's position, so a move cannot repeat or skip the others.
    async listConversations(input: McpInput<"list_conversations">) {
      const p = newestFirstPagination(scope, "list_conversations", input);
      const lastActivity = sql<Date | null>`(select max(m.created_at) from ${messagingMessages} m where m.conversation_id = ${messagingConversations.id})`;
      // A conversation without messages is as active as its creation.
      const activeAt = newest(sql`coalesce(${lastActivity}, ${messagingConversations.createdAt})`);
      const rows = await db
        .select({
          id: messagingConversations.id,
          kind: messagingConversations.kind,
          name: conversationDisplayName(db, {
            userId: identity.userId,
            excludeActorId: scope.actorEntityId,
          }),
          lastActivityAt: lastActivity,
          at: activeAt,
        })
        .from(messagingConversations)
        .where(
          and(
            visibleConversations(db, identity),
            input.kind ? eq(messagingConversations.kind, input.kind) : undefined,
            input.activeSince
              ? sql`${lastActivity} >= ${input.activeSince}::timestamptz`
              : undefined,
            olderThan(p, activeAt, messagingConversations.id),
          ),
        )
        .orderBy(desc(activeAt), desc(messagingConversations.id))
        .limit(p.take);
      const page = p.page(rows, position);
      return {
        items: page.items.map((row) => ({
          id: row.id,
          kind: row.kind,
          name: row.name,
          lastActivityAt: row.lastActivityAt ? iso(row.lastActivityAt) : null,
        })),
        nextCursor: page.nextCursor,
      };
    },
    async readConversation(input: McpInput<"read_conversation">) {
      const [conversation] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.id, input.conversationId),
            visibleConversations(db, identity),
          ),
        );
      if (!conversation) throw new AccessDeniedError();
      // A reply moves its root to the top; pages continue from the last root's position.
      const p = newestFirstPagination(scope, "read_conversation", input);
      const bounds = (column: SQL) =>
        sql.join(
          [
            input.since ? sql`${column} >= ${input.since}::timestamptz` : undefined,
            input.until ? sql`${column} < ${input.until}::timestamptz` : undefined,
          ].filter((part) => part !== undefined),
          sql` and `,
        );
      const windowed = Boolean(input.since || input.until);
      const posted = windowed ? bounds(sql`${messagingMessages.createdAt}`) : sql`true`;
      const replyInWindow = sql<
        string | null
      >`(select max(r.created_at) ${replies(windowed ? sql`and ${bounds(sql`r.created_at`)}` : sql``)})`;
      // A root is shown when it was posted in the window or its thread got a reply in the window.
      const activity = newest(
        windowed
          ? sql`greatest(case when ${posted} then ${messagingMessages.createdAt} end, ${replyInWindow}::timestamptz)`
          : sql`greatest(${messagingMessages.createdAt}, ${lastReplyAt}::timestamptz)`,
      );
      const rows = await db
        .select({
          id: messagingMessages.id,
          author: authorSelection(identity.userId),
          body: sql<string>`case when ${messagingMessages.deletedAt} is not null then 'Message deleted' else ${messagingMessages.body} end`,
          createdAt: messagingMessages.createdAt,
          replyCount,
          lastReplyAt,
          posted: sql<boolean>`${posted}`,
          at: activity,
        })
        .from(messagingMessages)
        .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
        .leftJoin(user, eq(user.id, actors.userId))
        .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
        .where(
          and(
            eq(messagingMessages.conversationId, input.conversationId),
            sql`${messagingMessages.threadId} is null`,
            windowed ? sql`(${posted} or ${replyInWindow} is not null)` : undefined,
            olderThan(p, activity, messagingMessages.id),
          ),
        )
        .orderBy(desc(activity), desc(messagingMessages.id))
        .limit(p.take);
      const page = p.page(rows, position);
      const records = await recordsOfMessages(
        ctx,
        page.items.map((row) => row.id),
      );
      return {
        items: page.items.map(
          ({ body, posted, at: _at, ...row }): McpOutput<"read_conversation">["items"][number] => ({
            ...row,
            ...excerpt(body),
            createdAt: iso(row.createdAt),
            lastReplyAt: row.lastReplyAt ? iso(row.lastReplyAt) : null,
            includedBecause: posted ? "posted" : "thread_activity",
            records: records.get(row.id) ?? [],
          }),
        ),
        nextCursor: page.nextCursor,
      };
    },
    async readThread(input: McpInput<"read_thread">): Promise<McpOutput<"read_thread">> {
      const { message } = await requireMessage(db, identity, input.messageId);
      const rootId = message.threadId ?? message.id;
      // A reply and its root open the same thread, so either one continues the same cursor.
      const thread = { ...input, messageId: rootId };
      const p = pagination(scope, "read_thread", thread);
      const columns = {
        id: messagingMessages.id,
        author: authorSelection(identity.userId),
        body: sql<string>`case when ${messagingMessages.deletedAt} is not null then 'Message deleted' else ${messagingMessages.body} end`,
        createdAt: messagingMessages.createdAt,
      };
      const authored = () =>
        joinActorAccount(
          db
            .select(columns)
            .from(messagingMessages)
            .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
            .$dynamic(),
        );
      const inConversation = eq(messagingMessages.conversationId, message.conversationId);
      const [root] = await authored().where(and(inConversation, eq(messagingMessages.id, rootId)));
      if (!root) throw new AccessDeniedError();
      const rows = await authored()
        .where(and(inConversation, eq(messagingMessages.threadId, rootId)))
        .orderBy(asc(messagingMessages.createdAt), asc(messagingMessages.id))
        .offset(p.offset)
        .limit(p.take);
      const records = await recordsOfMessages(ctx, [
        root.id,
        ...rows.slice(0, input.limit).map((row) => row.id),
      ]);
      const format = (row: typeof root) => ({
        ...row,
        createdAt: iso(row.createdAt),
        records: records.get(row.id) ?? [],
      });
      return {
        conversationId: message.conversationId,
        root: format(root),
        replies: p.page(rows.map(format)),
      };
    },
  };
}
