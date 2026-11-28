import { InboxToolError } from "@substrate/agent-host";
import type { McpInput, McpOutput } from "@substrate/contracts/agent-tools/tools";
import type { Mailbox } from "@substrate/contracts/mail";

import type { GmailWork } from "../gmail/gmail-connection.ts";
import type { gmailReader } from "../gmail/gmail-reader.ts";
import type { LocalMail } from "../session.ts";
import { boxName, mailSummary } from "./agent-excerpts.ts";
import { randomUUID } from "node:crypto";

type Search = McpInput<"search_inbox">;
type Page = McpOutput<"search_inbox">;
type Source = { id: string; token: string | null; cached: boolean };
type Cursor = { filters: string; before: number; sources: Source[]; seen: string[] };
type Check = (signal: AbortSignal) => Promise<void>;
type Reader = ReturnType<typeof gmailReader>;

/** Keep Gmail's current labels for already-cached mail. A minimal GET never marks it read. */
export async function refreshMailLabels(
  local: LocalMail,
  box: string,
  ids: string[],
  reader: Reader,
  grant: () => string,
  signal: AbortSignal,
  check: Check,
) {
  if (!ids.length) return;
  const states = await reader.messageLabels(ids);
  await check(signal);
  signal.throwIfAborted();
  for (const m of states.messages) await local.db.applyMessageState(box, m.remoteId, grant(), m);
  for (const id of states.removed) await local.db.applyMessageState(box, id, grant(), null);
}

async function searchBox(
  local: LocalMail,
  box: Mailbox,
  source: Source,
  state: Cursor,
  q: Search,
  share: number,
  gmail: GmailWork,
  check: Check,
  deadline: AbortSignal,
) {
  const headers = (limit: number, ids?: string[]) =>
    local.db.inboxHeaders({
      box: box.id,
      query: q.query,
      unreadOnly: q.unreadOnly,
      limit,
      seen: state.seen,
      remoteIds: ids,
    });
  if (!source.cached && box.status !== "reconnect") {
    try {
      return await local.jobs.run(
        box.id,
        (signal) =>
          gmail(local, box.id, signal, async (reader, grant) => {
            const page = await reader.olderIds(
              { mailboxId: box.id, view: "inbox", search: q.query, unreadOnly: q.unreadOnly },
              state.before,
              source.token,
              share,
            );
            if (!page || (page.token && page.token === source.token))
              throw new Error("Expired Gmail page.");
            const cached = await local.db.cachedDates(box.id, page.ids);
            const missing = page.ids.filter((id) => !cached.has(id));
            if (missing.length) {
              const messages = await reader.olderMessages(missing);
              await check(signal);
              signal.throwIfAborted();
              await local.db.cacheOlder(box.id, grant(), messages);
            }
            await refreshMailLabels(
              local,
              box.id,
              [...cached.keys()],
              reader,
              grant,
              signal,
              check,
            );
            return {
              rows: await headers(share, page.ids),
              coverage: "gmail" as const,
              next: page.token ? { ...source, token: page.token } : null,
            };
          }),
        deadline,
      );
    } catch {
      local.abort.signal.throwIfAborted();
    }
  }
  const rows = await headers(share + 1);
  return {
    rows: rows.slice(0, share),
    coverage: "cached" as const,
    next: rows.length > share ? { ...source, cached: true } : null,
  };
}

export function createInboxSearch(gmail: GmailWork) {
  const sessions = new WeakMap<LocalMail, Map<string, Cursor>>();
  return async (local: LocalMail, q: Search, check: Check): Promise<Page> => {
    const boxes = (await local.db.accounts()).filter((b) => !q.mailboxId || b.id === q.mailboxId);
    if (q.mailboxId && !boxes.length) throw new InboxToolError("NOT_FOUND", "Mailbox unavailable.");
    const filters = JSON.stringify([
      q.query,
      q.unreadOnly,
      q.mailboxId,
      q.limit,
      boxes.map((b) => b.id).sort(),
    ]);
    const now = Date.now();
    let cursors = sessions.get(local);
    if (!cursors) sessions.set(local, (cursors = new Map<string, Cursor>()));
    for (const [id, c] of cursors) if (now - c.before >= 10 * 60_000) cursors.delete(id);
    const previous = q.cursor && cursors.get(q.cursor);
    if (q.cursor && (!previous || previous.filters !== filters))
      throw new InboxToolError(
        "INVALID_INPUT",
        "Search changed or expired. Start again without the cursor.",
      );
    const state: Cursor = previous
      ? structuredClone(previous)
      : {
          filters,
          before: now,
          sources: boxes.map((b) => ({ id: b.id, token: null, cached: false })),
          seen: [],
        };
    const sources = state.sources.splice(0, Math.min(q.limit, 3));
    const deadline = AbortSignal.any([local.abort.signal, AbortSignal.timeout(20_000)]);
    const parts = await Promise.all(
      sources.map(async (s, i) => {
        const box = boxes.find((b) => b.id === s.id)!;
        const share = Math.floor(q.limit / sources.length) + Number(i < q.limit % sources.length);
        const page = await searchBox(local, box, s, state, q, share, gmail, check, deadline);
        return { box, ...page };
      }),
    );
    await check(local.abort.signal);
    const connected = new Set((await local.db.accounts()).map((b) => b.id));
    const result: Page = {
      items: [],
      mailboxes: [],
      connectedMailboxes: boxes.length,
      nextCursor: null,
    };
    for (const { box, rows, next, coverage } of parts) {
      if (!connected.has(box.id))
        throw new InboxToolError("NOT_FOUND", "Mailbox disconnected. Search again.");
      result.mailboxes.push({
        mailboxId: box.id,
        mailbox: boxName(box),
        coverage,
        lastSync: box.lastSync === null ? null : new Date(box.lastSync).toISOString(),
      });
      for (const row of rows) {
        result.items.push(mailSummary(box, row));
        state.seen.push(row.id);
      }
      if (next) state.sources.push(next);
    }
    result.items.sort((a, b) => b.date.localeCompare(a.date));
    if (state.sources.length) {
      if (cursors.size >= 32) cursors.delete(cursors.keys().next().value!);
      result.nextCursor = randomUUID();
      cursors.set(result.nextCursor, state);
    }
    return result;
  };
}
