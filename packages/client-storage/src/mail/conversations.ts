import { mailFlag, mailViewRule } from "@substrate/contracts/mail";
import type { MailFolder } from "@substrate/contracts/mail/ipc";

import { foldSearchText, type LocalTransaction } from "../database.ts";
import { mailMessages } from "../schema/mail.ts";
import { and, asc, eq, sql } from "drizzle-orm";

export const headers = {
  id: mailMessages.id,
  mailboxId: mailMessages.mailboxId,
  from: mailMessages.from,
  to: mailMessages.to,
  subject: mailMessages.subject,
  snippet: mailMessages.snippet,
  timestamp: mailMessages.timestamp,
  flags: mailMessages.flags,
  labelIds: mailMessages.labelIds,
};
export function membership(view: MailFolder["view"], now: number) {
  const rule = mailViewRule(view, now);
  return and(
    sql`(${mailMessages.flags} & ${rule.require}) = ${rule.require}`,
    sql`(${mailMessages.flags} & ${rule.exclude}) = 0`,
    rule.since === null ? undefined : sql`${mailMessages.timestamp} >= ${rule.since}`,
  )!;
}
const normal = sql`(${mailMessages.flags} & ${mailFlag.trash | mailFlag.spam}) = 0`;

export function conversationFilter(q: MailFolder, now: number) {
  const term = foldSearchText(q.search.trim());
  const match = and(
    q.label
      ? and(
          normal,
          eq(mailMessages.mailboxId, q.label.mailboxId),
          sql`exists (select 1 from json_each(${mailMessages.labelIds}) where value = ${q.label.id})`,
        )
      : membership(q.view, now),
    term
      ? sql`instr(fold_search(${mailMessages.subject} || ' ' || ${mailMessages.from} || ' ' || ${mailMessages.to} || ' ' || ${mailMessages.snippet}),${term}) > 0`
      : undefined,
  )!;
  // For a search, label or special folder, preview its latest match. Inbox threads sort by latest
  // activity, including replies sent since the latest inbound message. No body enters this query.
  const inbox = q.view === "inbox" && !q.label && !term;
  return { match, priority: inbox ? normal : match, inbox };
}

export async function threadHeaders(tx: LocalTransaction, org: string, id: string) {
  const orgScope = eq(mailMessages.organizationId, org);
  const member = await tx
    .select({ mailbox: mailMessages.mailboxId, thread: mailMessages.threadId })
    .from(mailMessages)
    .where(and(orgScope, eq(mailMessages.id, id)))
    .get();
  if (!member) return [];
  return tx
    .select(headers)
    .from(mailMessages)
    .where(
      and(
        orgScope,
        eq(mailMessages.mailboxId, member.mailbox),
        member.thread === null ? eq(mailMessages.id, id) : eq(mailMessages.threadId, member.thread),
      ),
    )
    .orderBy(asc(mailMessages.timestamp), mailMessages.id);
}
