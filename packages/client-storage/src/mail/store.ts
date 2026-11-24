import { newId } from "@substrate/contracts/ids";
import type { MailBody, MailHeader, MailLabel } from "@substrate/contracts/mail";

import { openLocalDatabase, serialTransactions } from "../database.ts";
import { mailConnections, mailMessages } from "../schema/mail.ts";
import { mailActions } from "./actions.ts";
import { mailConnectionRepository } from "./connections.ts";
import { mailReads } from "./reads.ts";
import { and, eq, inArray, sql } from "drizzle-orm";

export type SyncedMail = Omit<MailHeader, "id" | "mailboxId"> & {
  remoteId: string;
  threadId: string | null;
  body: MailBody;
};
export type SyncPage = {
  messages: SyncedMail[];
  removed: string[];
  labels?: Pick<SyncedMail, "remoteId" | "flags" | "labelIds">[];
  unreadTotal?: number;
  cursor: string;
  done: boolean;
};

export async function openMailStore(path: string, org: string, migrations?: string) {
  const { database, close } = await openLocalDatabase(path, migrations);
  const run = serialTransactions(database);
  const connection = (id: string) =>
    and(eq(mailConnections.organizationId, org), eq(mailConnections.id, id));
  const mailbox = (id: string) =>
    and(eq(mailMessages.organizationId, org), eq(mailMessages.mailboxId, id));
  return {
    close,
    ...mailReads(run, org),
    ...mailActions(run, org),
    ...mailConnectionRepository(run, org),
    cachedDates: (id: string, ids: string[]) =>
      run(async (tx) => {
        const rows = await tx
          .select({ id: mailMessages.remoteId, stamp: mailMessages.timestamp })
          .from(mailMessages)
          .where(
            and(
              mailbox(id),
              sql`${mailMessages.remoteId} in (select value from json_each(${JSON.stringify(ids)}))`,
            ),
          );
        return new Map(rows.map((r) => [r.id, r.stamp]));
      }),
    // Paging is independent of inbox/history sync. Never move its checkpoint, replace
    // a concurrently refreshed message, or resurrect mail after disconnect/reconnect.
    cacheOlder: (id: string, grant: string, messages: SyncedMail[]) =>
      run(async (tx) => {
        const present = await tx
          .select({ id: mailConnections.id })
          .from(mailConnections)
          .where(and(connection(id), eq(mailConnections.protectedGrant, grant)))
          .get();
        if (!present) throw new Error("Mailbox authorization changed.");
        for (const m of messages)
          await tx
            .insert(mailMessages)
            .values({ ...m, id: newId(), organizationId: org, mailboxId: id })
            .onConflictDoNothing();
      }),
    labels: (id: string, labels: Pick<MailLabel, "id" | "name">[]) =>
      run(async (tx) => {
        const row = await tx
          .select({ labels: mailConnections.labels })
          .from(mailConnections)
          .where(connection(id))
          .get();
        if (!row) throw new Error("Mailbox unavailable.");
        const previous = new Map(row.labels.map((l) => [l.id, l]));
        const catalog = labels.map(({ id, name }) => ({ ...previous.get(id), id, name }));
        await tx.update(mailConnections).set({ labels: catalog }).where(connection(id));
      }),
    fail: (id: string, protectedGrant: string, status: "retry" | "reconnect") =>
      run(async (tx) => {
        await tx
          .update(mailConnections)
          .set({ status })
          .where(and(connection(id), eq(mailConnections.protectedGrant, protectedGrant)));
      }),
    commit: (id: string, previous: string | null, page: SyncPage) =>
      run(async (tx) => {
        // Compare-and-set also rolls the page back if two wakes race on different connections to SQLite.
        const changed = await tx
          .update(mailConnections)
          .set({
            cursor: page.cursor,
            // While the worker is alive the bridge reports syncing. On restart, a partial
            // commit is resumable even when a previous sync had already set lastSync.
            status: page.done ? "idle" : "retry",
            lastSync: page.done ? Date.now() : undefined,
            unreadTotal: page.unreadTotal,
          })
          .where(and(connection(id), sql`${mailConnections.cursor} IS ${previous}`))
          .returning({ id: mailConnections.id });
        if (!changed.length) throw new Error("Mailbox checkpoint changed.");
        for (const message of page.messages) {
          await tx
            .insert(mailMessages)
            .values({ ...message, id: newId(), organizationId: org, mailboxId: id })
            .onConflictDoUpdate({
              target: [mailMessages.organizationId, mailMessages.mailboxId, mailMessages.remoteId],
              set: message,
            });
        }
        for (const { remoteId, flags, labelIds } of page.labels ?? [])
          await tx
            .update(mailMessages)
            .set({ flags, labelIds })
            .where(and(mailbox(id), eq(mailMessages.remoteId, remoteId)));
        // Keep bindings below SQLite limits, including on very large history pages.
        for (let i = 0; i < page.removed.length; i += 400)
          await tx
            .delete(mailMessages)
            .where(
              and(mailbox(id), inArray(mailMessages.remoteId, page.removed.slice(i, i + 400))),
            );
      }),
  };
}
export type MailStore = Awaited<ReturnType<typeof openMailStore>>;
