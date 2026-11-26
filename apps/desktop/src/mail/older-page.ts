import type { MailStore, SyncedMail } from "@substrate/client-storage/mail";
import { mailPageSize, type Mailbox } from "@substrate/contracts/mail";
import type { MailPageSource, OlderMailPage, OlderMailQuery } from "@substrate/contracts/mail/ipc";

import type { gmailReader } from "./gmail/gmail-reader.ts";
import { ReconnectRequired } from "./provider.ts";

type OlderReader = Pick<ReturnType<typeof gmailReader>, "olderIds" | "olderMessages">;
/** The fewest message IDs one Gmail read asks for. */
const minimumOlderBatch = 10;
type SourceRead = (
  mailbox: string,
  source: MailPageSource | undefined,
  limit: number,
) => Promise<MailPageSource>;

/** Read just one ID page. Gmail can return multiple pages in the same second:
 * keep its opaque token and overlap the boundary second if the token expires. */
export async function readOlderSource(
  reader: OlderReader,
  query: OlderMailQuery,
  mailboxId: string,
  source: MailPageSource | undefined,
  limit: number,
  cachedDates: (ids: string[]) => Promise<Map<string, number>>,
  save: (messages: SyncedMail[]) => Promise<void>,
): Promise<MailPageSource> {
  let before = source?.before ?? query.before;
  let page = await reader.olderIds(query, before, source?.token ?? null, limit);
  if (!page && source?.token) {
    before = source.through;
    page = await reader.olderIds(query, before, null, limit);
  }
  if (!page) throw new Error("Gmail page unavailable.");
  const dates = await cachedDates(page.ids);
  const missing = page.ids.filter((id) => !dates.has(id));
  // A timeout halfway through a page should not make a retry download those bodies again.
  for (let i = 0; i < missing.length; i += 8) {
    const messages = await reader.olderMessages(missing.slice(i, i + 8));
    await save(messages);
    for (const message of messages) dates.set(message.remoteId, message.timestamp);
  }
  return {
    mailboxId,
    before,
    token: page.token,
    through: page.token ? Math.min(source?.through ?? before, ...dates.values()) : 0,
  };
}

/** Fill one displayed page, not one raw Gmail response. Several messages can belong
 * to one thread, and a quiet mailbox need not use its share of a unified page. */
export async function nextMailPage(
  q: OlderMailQuery,
  boxes: Pick<Mailbox, "id" | "status">[],
  cachedPage: MailStore["cachedPage"],
  read: SourceRead,
): Promise<OlderMailPage> {
  const targets = boxes.filter(
    (b) => (!q.mailboxId || b.id === q.mailboxId) && (!q.label || b.id === q.label.mailboxId),
  );
  const sources = new Map(
    q.sources.filter((s) => targets.some((b) => b.id === s.mailboxId)).map((s) => [s.mailboxId, s]),
  );
  const pending = () => targets.filter((b) => sources.get(b.id)?.token !== null);
  const boundary = (id: string) => sources.get(id)?.through ?? q.before;
  const frontier = () => Math.max(0, ...pending().map((b) => boundary(b.id)));
  let cached = await cachedPage(q);
  function result(issue?: OlderMailPage["issue"]): OlderMailPage {
    const floor = frontier();
    const items = issue ? cached.items : cached.items.filter((m) => m.timestamp >= floor);
    return {
      items,
      sources: [...sources.values()],
      hasMore: cached.hasMore || cached.items.length > items.length || pending().length > 0,
      issue,
    };
  }
  const visited = new Map<string, Set<string>>();
  for (;;) {
    const page = result();
    const remaining = mailPageSize - page.items.length;
    if (!pending().length || !remaining) return page;
    // Once the cache has 50 candidates, only the sources that could change their
    // order need to advance. An exhausted source never receives another request.
    const floor =
      cached.items.length === mailPageSize ? cached.items[mailPageSize - 1]!.timestamp : 0;
    const need = pending()
      .filter((b) => boundary(b.id) >= floor)
      .slice(0, mailPageSize);
    // Fetched IDs can belong to threads already shown, so a few free slots still read a batch;
    // extra messages land in the cache for the next page.
    const limit = Math.max(minimumOlderBatch, Math.ceil(remaining / need.length));
    let issue: OlderMailPage["issue"];
    await Promise.all(
      need.map(async (b) => {
        try {
          if (b.status === "reconnect") throw new ReconnectRequired("Reconnect Gmail.");
          const next = await read(b.id, sources.get(b.id), limit);
          if (next.token !== null) {
            const tokens = visited.get(b.id) ?? new Set<string>();
            const cursor = JSON.stringify([next.before, next.token]);
            if (tokens.has(cursor)) throw new Error("Gmail pagination stalled.");
            tokens.add(cursor);
            visited.set(b.id, tokens);
          }
          sources.set(b.id, next);
        } catch (error) {
          if (error instanceof ReconnectRequired) issue = "reconnect";
          else issue ??= "unavailable";
        }
      }),
    );
    cached = await cachedPage(q);
    if (issue) return result(issue);
  }
}
