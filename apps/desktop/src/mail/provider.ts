import type { MailStore, SyncedMail, SyncPage } from "@substrate/client-storage/mail";
import { mailViewRule, type MailLabel } from "@substrate/contracts/mail";

/** Changed IDs need current labels only if their bodies are already cached. */
export type MailChanges = SyncPage & { changedIds?: string[] };

/** The worker never interprets a provider cursor. A wake is only a request to reconcile. */
export interface MailReader {
  labels(): Promise<MailLabel[]>;
  page(cursor: string | null): Promise<MailChanges>;
  unreadIds(): Promise<string[]>;
  messageLabels(ids: Iterable<string>): Promise<{
    messages: Pick<SyncedMail, "remoteId" | "flags" | "labelIds">[];
    removed: string[];
  }>;
}
export class ReconnectRequired extends Error {}

async function reconcileLabels(
  store: Pick<MailStore, "unreadDifferences" | "cachedDates">,
  id: string,
  reader: MailReader,
  page: MailChanges,
  recount: boolean,
) {
  if (!recount && !page.changedIds?.length) return page;
  const unread = recount ? new Set(await reader.unreadIds()) : undefined;
  const changed = new Set(unread ? await store.unreadDifferences(id, [...unread]) : []);
  if (page.changedIds?.length)
    for (const cached of (await store.cachedDates(id, page.changedIds)).keys()) changed.add(cached);
  const rule = mailViewRule("unread", Date.now());
  const matches = (flags: number) => (flags & (rule.require | rule.exclude)) === rule.require;
  // The final body batch hasn't committed yet. Compare its newer flags instead of
  // the cached versions. A missing ID in the unread list is not evidence of deletion.
  for (const m of page.messages) {
    if (unread && matches(m.flags) !== unread.has(m.remoteId)) changed.add(m.remoteId);
    else changed.delete(m.remoteId);
  }
  for (const remoteId of page.removed) changed.delete(remoteId);
  const { messages, removed } = await reader.messageLabels(changed);
  for (const m of messages) {
    if (matches(m.flags)) unread?.add(m.remoteId);
    else unread?.delete(m.remoteId);
  }
  for (const remoteId of [...page.removed, ...removed]) unread?.delete(remoteId);
  return {
    ...page,
    labels: messages,
    removed: [...page.removed, ...removed],
    unreadTotal: unread?.size,
  };
}

export async function syncMailbox(
  store: Pick<MailStore, "connection" | "labels" | "commit" | "unreadDifferences" | "cachedDates">,
  id: string,
  reader: MailReader,
  signal: AbortSignal,
  beforeCommit?: () => Promise<void>,
) {
  const connection = await store.connection(id);
  if (!connection) throw new Error("Mailbox unavailable.");
  let cursor = connection.cursor;
  const visited = new Set([cursor]);
  const labels = await reader.labels();
  await beforeCommit?.();
  signal.throwIfAborted();
  await store.labels(id, labels);
  for (;;) {
    signal.throwIfAborted();
    const changes = await reader.page(cursor);
    if (!changes.done) {
      if (visited.has(changes.cursor)) throw new Error("Mailbox sync cursor did not advance.");
      visited.add(changes.cursor);
    }
    const page = await reconcileLabels(
      store,
      id,
      reader,
      changes,
      changes.done && (connection.unreadTotal === null || changes.cursor !== connection.cursor),
    );
    await beforeCommit?.();
    signal.throwIfAborted();
    await store.commit(id, cursor, page);
    if (page.done) return;
    cursor = page.cursor;
  }
}
