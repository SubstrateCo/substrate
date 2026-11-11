import type { McpInput, McpOutput } from "@substrate/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { requireMessage, visibleConversations, type MessagingIdentity } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { excerpt, iso } from "./formatting";
import { pagination } from "./pagination";
import { authorSelection } from "./tasks";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

export function mcpMessagingQueries(ctx: RepositoryContext, identity: MessagingIdentity) {
  const { db, scope } = ctx;
  const replies = (rest: SQL = sql``) =>
    sql`from ${messagingMessages} r where r.conversation_id = ${messagingMessages.conversationId} and r.thread_id = ${messagingMessages.id} ${rest}`;
  const replyCount = sql<number>`(select count(*)::int ${replies()})`;
  const lastReplyAt = sql<string | null>`(select max(r.created_at)::text ${replies()})`;
  return {
    async listConversations(input: McpInput<"list_conversations">) {
      const p = pagination(scope, "list_conversations", input);
      const lastActivity = sql<Date | null>`(select max(m.created_at) from ${messagingMessages} m where m.conversation_id = ${messagingConversations.id})`;
      const rows = await db
        .select({
          id: messagingConversations.id,
          kind: messagingConversations.kind,
          name: conversationDisplayName(db, {
            userId: identity.userId,
            excludeActorId: scope.actorEntityId,
          }),
          lastActivityAt: lastActivity,
        })
        .from(messagingConversations)
        .where(
          and(
            visibleConversations(db, identity),
            input.kind ? eq(messagingConversations.kind, input.kind) : undefined,
            input.activeSince
              ? sql`${lastActivity} >= ${input.activeSince}::timestamptz`
              : undefined,
          ),
        )
        .orderBy(sql`${lastActivity} desc nulls last`, desc(messagingConversations.id))
        .offset(p.offset)
        .limit(p.take);
      return p.page(
        rows.map((row) => ({
          ...row,
          lastActivityAt: row.lastActivityAt ? iso(row.lastActivityAt) : null,
        })),
      );
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
      const p = pagination(scope, "read_conversation", input);
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
      const activity = windowed
        ? sql`greatest(case when ${posted} then ${messagingMessages.createdAt} end, ${replyInWindow}::timestamptz)`
        : sql`greatest(${messagingMessages.createdAt}, ${lastReplyAt}::timestamptz)`;
      const rows = await db
        .select({
          id: messagingMessages.id,
          author: authorSelection(identity.userId),
          body: messagingMessages.body,
          createdAt: messagingMessages.createdAt,
          replyCount,
          lastReplyAt,
          posted: sql<boolean>`${posted}`,
        })
        .from(messagingMessages)
        .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
        .where(
          and(
            eq(messagingMessages.conversationId, input.conversationId),
            sql`${messagingMessages.threadId} is null`,
            windowed ? sql`(${posted} or ${replyInWindow} is not null)` : undefined,
          ),
        )
        .orderBy(sql`${activity} desc`, desc(messagingMessages.id))
        .offset(p.offset)
        .limit(p.take);
      return p.page(
        rows.map(({ body, posted, ...row }): McpOutput<"read_conversation">["items"][number] => ({
          ...row,
          ...excerpt(body),
          createdAt: iso(row.createdAt),
          lastReplyAt: row.lastReplyAt ? iso(row.lastReplyAt) : null,
          includedBecause: posted ? "posted" : "thread_activity",
        })),
      );
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
        body: messagingMessages.body,
        createdAt: messagingMessages.createdAt,
      };
      const author = eq(actors.entityId, messagingMessages.authorActorEntityId);
      const inConversation = eq(messagingMessages.conversationId, message.conversationId);
      const [root] = await db
        .select(columns)
        .from(messagingMessages)
        .innerJoin(actors, author)
        .where(and(inConversation, eq(messagingMessages.id, rootId)));
      if (!root) throw new AccessDeniedError();
      const rows = await db
        .select(columns)
        .from(messagingMessages)
        .innerJoin(actors, author)
        .where(and(inConversation, eq(messagingMessages.threadId, rootId)))
        .orderBy(asc(messagingMessages.createdAt), asc(messagingMessages.id))
        .offset(p.offset)
        .limit(p.take);
      const format = (row: typeof root) => ({ ...row, createdAt: iso(row.createdAt) });
      return {
        conversationId: message.conversationId,
        root: format(root),
        replies: p.page(rows.map(format)),
      };
    },
  };
}
