import { mailPageSize, type MailConversation } from "@substrate/contracts/mail";
import type { MailFolder, OlderMailQuery } from "@substrate/contracts/mail/ipc";

import type { LocalTransaction } from "../database.ts";
import { mailMessages } from "../schema/mail.ts";
import { conversationFilter, headers, membership } from "./conversations.ts";
import { and, desc, eq, exists, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { mapColumnsInSQLToAlias } from "drizzle-orm/alias";
import { alias } from "drizzle-orm/sqlite-core";

export async function cachedConversations(
  tx: LocalTransaction,
  org: string,
  q: MailFolder & Partial<Pick<OlderMailQuery, "before" | "seen" | "shownThrough">>,
) {
  const now = Date.now();
  const { match, priority, inbox } = conversationFilter(q, now);
  const peer = alias(mailMessages, "peer");
  const forPeer = (rule: SQL) => mapColumnsInSQLToAlias(rule, "peer");
  const same = and(
    eq(peer.organizationId, mailMessages.organizationId),
    eq(peer.mailboxId, mailMessages.mailboxId),
    eq(peer.threadId, mailMessages.threadId),
  );
  const atBoundary = q.before === undefined ? same : and(same, lte(peer.timestamp, q.before));
  const head = tx
    .select({ id: peer.id })
    .from(peer)
    .where(and(atBoundary, forPeer(priority)))
    .orderBy(desc(peer.timestamp), peer.id)
    .limit(1);
  const inInbox = tx
    .select({ id: peer.id })
    .from(peer)
    .where(and(atBoundary, forPeer(match)));
  const stat = (single: SQL, aggregate: SQL) => {
    const group = tx.select({ value: aggregate }).from(peer).where(same);
    return sql<number>`case when ${mailMessages.threadId} is null then ${single} else ${group} end`;
  };
  const unread = membership("unread", now),
    starred = membership("starred", now);
  const rows = await tx
    .select({
      ...headers,
      threadId: mailMessages.threadId,
      messageCount: stat(sql`1`, sql`count(*)`),
      unreadMessages: stat(unread, sql`sum(${forPeer(unread)})`),
      star: stat(starred, sql`max(${forPeer(starred)})`),
    })
    .from(mailMessages)
    .where(
      and(
        eq(mailMessages.organizationId, org),
        q.mailboxId === null ? undefined : eq(mailMessages.mailboxId, q.mailboxId),
        q.before === undefined ? undefined : lte(mailMessages.timestamp, q.before),
        q.shownThrough === undefined ? undefined : lte(mailMessages.timestamp, q.shownThrough),
        priority,
        inbox ? or(match, exists(inInbox)) : undefined,
        q.seen?.length
          ? sql`json_array(${mailMessages.mailboxId}, case when ${mailMessages.threadId} is null then 'message' else 'thread' end, coalesce(${mailMessages.threadId},${mailMessages.id})) not in (select value from json_each(${JSON.stringify(q.seen)}))`
          : undefined,
        or(isNull(mailMessages.threadId), eq(mailMessages.id, head)),
      ),
    )
    .orderBy(desc(mailMessages.timestamp), desc(mailMessages.id))
    .limit(mailPageSize + 1);
  return {
    items: rows.slice(0, mailPageSize).map(({ star, ...row }): MailConversation => ({
      ...row,
      hasUnread: !!row.unreadMessages,
      hasStar: !!star,
    })),
    hasMore: rows.length > mailPageSize,
  };
}
