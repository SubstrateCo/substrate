import type { Mailbox, MailPage } from "@substrate/contracts/mail";
import type { MailFolder, OlderMailQuery } from "@substrate/contracts/mail/ipc";

import { openLocalReader, serialTransactions, type RunTransaction } from "../database.ts";
import { mailConnections, mailMessages } from "../schema/mail.ts";
import { agentMailReads } from "./agent-reads.ts";
import { membership, threadHeaders } from "./conversations.ts";
import { cachedConversations } from "./older-conversations.ts";
import { and, eq, inArray, sql } from "drizzle-orm";

export function openMailReads(path: string, org: string) {
  const { database, close } = openLocalReader(path);
  return { ...mailReads(serialTransactions(database), org), close };
}

export function mailReads(run: RunTransaction, org: string) {
  return {
    ...agentMailReads(run, org),
    unreadDifferences: (mailbox: string, ids: string[]) =>
      run(async (tx) => {
        const scope = and(
          eq(mailMessages.organizationId, org),
          eq(mailMessages.mailboxId, mailbox),
        );
        const unread = membership("unread", Date.now());
        const remote = sql`(select value from json_each(${JSON.stringify(ids)}))`;
        const selectIds = () => tx.select({ id: mailMessages.remoteId }).from(mailMessages);
        // Walk local unread flags and look up remote unread IDs, without reading message bodies.
        const localOnly = selectIds().where(
          and(scope, unread, sql`${mailMessages.remoteId} not in ${remote}`),
        );
        const remoteOnly = selectIds().where(
          and(scope, sql`not (${unread})`, sql`${mailMessages.remoteId} in ${remote}`),
        );
        return (await localOnly.unionAll(remoteOnly)).map((r) => r.id);
      }),
    cachedPage: (q: OlderMailQuery) => run((tx) => cachedConversations(tx, org, q)),
    thread: (id: string) => run((tx) => threadHeaders(tx, org, id)),
    accounts: (): Promise<Mailbox[]> =>
      run(async (tx) => {
        const boxes = await tx
          .select({
            id: mailConnections.id,
            address: mailConnections.address,
            nickname: mailConnections.nickname,
            canModify: mailConnections.canModify,
            labels: mailConnections.labels,
            showLabelFilters: mailConnections.showLabelFilters,
            lastSync: mailConnections.lastSync,
            status: mailConnections.status,
          })
          .from(mailConnections)
          .where(eq(mailConnections.organizationId, org))
          .orderBy(mailConnections.address)
          .all();
        const conditional = boxes
          .filter(
            (box) => box.showLabelFilters && box.labels.some((l) => l.filterMode === "unread"),
          )
          .map((box) => box.id);
        const byMailbox = new Map<string, string[]>();
        if (conditional.length) {
          const now = Date.now();
          const rows = await tx
            .selectDistinct({ mailbox: mailMessages.mailboxId, label: sql<string>`mail_tag.value` })
            .from(mailMessages)
            .innerJoin(sql`json_each(${mailMessages.labelIds}) as mail_tag`, sql`true`)
            .where(
              and(
                eq(mailMessages.organizationId, org),
                inArray(mailMessages.mailboxId, conditional),
                membership("unread", now),
              ),
            );
          for (const row of rows) {
            const labels = byMailbox.get(row.mailbox);
            if (labels) labels.push(row.label);
            else byMailbox.set(row.mailbox, [row.label]);
          }
        }
        return boxes.map((box) => ({ ...box, unreadLabelIds: byMailbox.get(box.id) ?? [] }));
      }),
    list: (q: MailFolder): Promise<MailPage> =>
      run(async (tx) => {
        const now = Date.now();
        const counts = await tx
          .select({
            mailboxId: mailConnections.id,
            newCount: sql<number>`count(*) filter (where ${membership("new", now)})`,
            // A page fetched after the last snapshot can already contain additional unread mail.
            unreadCount: sql<number>`max(coalesce(${mailConnections.unreadTotal}, 0), count(*) filter (where ${membership("unread", now)}))`,
            draftCount: sql<number>`count(*) filter (where ${membership("drafts", now)})`,
          })
          .from(mailConnections)
          .leftJoin(
            mailMessages,
            and(
              eq(mailMessages.organizationId, mailConnections.organizationId),
              eq(mailMessages.mailboxId, mailConnections.id),
            ),
          )
          .where(
            and(
              eq(mailConnections.organizationId, org),
              q.mailboxId === null ? undefined : eq(mailConnections.id, q.mailboxId),
            ),
          )
          .groupBy(mailConnections.id);
        // Limit after matching the folder and collapsing threads. A busy Sent folder
        // or a long conversation must not push older Inbox entries off page one.
        const { items } = await cachedConversations(tx, org, q);
        return {
          items,
          newCount: counts.reduce((sum, row) => sum + row.newCount, 0),
          draftCount: counts.reduce((sum, row) => sum + row.draftCount, 0),
          unreadCount: counts.reduce((sum, row) => sum + row.unreadCount, 0),
          unreadByMailbox: Object.fromEntries(
            counts.map((row) => [row.mailboxId, row.unreadCount]),
          ),
        };
      }),
    body: (id: string) =>
      run(
        async (tx) =>
          (
            await tx
              .select({ body: mailMessages.body })
              .from(mailMessages)
              .where(and(eq(mailMessages.organizationId, org), eq(mailMessages.id, id)))
              .get()
          )?.body ?? null,
      ),
  };
}
