import { openMailStore, type SyncedMail } from "@substrate/client-storage/mail";
import { conversationKey, mailFlag, type MailConversation } from "@substrate/contracts/mail";
import type { OlderMailQuery } from "@substrate/contracts/mail/ipc";

import { gmailReader } from "./gmail/gmail-reader.ts";
import { nextMailPage, readOlderSource } from "./older-page.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("unified Next merges uneven mailboxes without gaps, duplicate threads or re-downloading cached bodies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gmail-older-"));
  const path = join(dir, "mail.sqlite"),
    store = await openMailStore(path, "workspace");
  const now = Date.now(),
    anchor = now - 6 * 86_400_000,
    cursor = '{"kind":"history","after":"123"}';
  const q: OlderMailQuery = {
    mailboxId: null,
    view: "inbox",
    search: "",
    before: anchor,
    sources: [],
    seen: [],
  };
  const fetched: string[] = [],
    lists: string[] = [];
  const providers = new Map<string, ReturnType<typeof gmailReader>>();
  try {
    for (const name of ["busy", "quiet"]) {
      const id = await store.connect({
        provider: "gmail",
        providerAccountId: name,
        address: `${name}@example.test`,
        nickname: null,
        protectedGrant: "grant",
      });
      // Both mailboxes reuse the same remote IDs. Two entries tie at every timestamp.
      const mail = (i: number): SyncedMail => ({
        remoteId: String(i),
        threadId: i < 2 ? "same-thread" : String(i),
        subject: `${name}-${i}`,
        timestamp: anchor - (name === "quiet" ? 70 : 0) * 1000 - Math.floor(i / 2) * 1000,
        from: "sender",
        to: "reader",
        snippet: "",
        flags: mailFlag.inbox,
        labelIds: ["INBOX"],
        body: { format: "plain", text: `Original ${i}` },
      });
      const count = name === "busy" ? 83 : 9;
      await store.commit(id, null, {
        messages: [mail(2), mail(count - 1)],
        removed: [],
        cursor,
        done: true,
      });
      providers.set(
        id,
        gmailReader(
          async () => "synthetic",
          new AbortController().signal,
          async (url) => {
            const endpoint = url.pathname.split("/me/")[1]!;
            if (endpoint === "messages") {
              lists.push(name);
              expect(url.searchParams.get("q")).toBe(`before:${Math.floor(anchor / 1000) + 1}`);
              expect(url.searchParams.get("labelIds")).toBe("INBOX");
              const start = Number(url.searchParams.get("pageToken") ?? 0),
                size = Number(url.searchParams.get("maxResults"));
              const end = Math.min(start + size, count);
              return Response.json({
                messages: Array.from({ length: end - start }, (_, j) => ({
                  id: String(start + j),
                })),
                nextPageToken: end < count ? String(end) : undefined,
              });
            }
            const i = Number(endpoint.slice(9)),
              m = mail(i);
            fetched.push(m.subject);
            return Response.json({
              id: m.remoteId,
              threadId: m.threadId,
              internalDate: m.timestamp,
              labelIds: ["INBOX"],
              payload: { headers: [{ name: "subject", value: m.subject }] },
            });
          },
        ),
      );
    }
    const boxes = await store.accounts();
    const order: number[] = [],
      sizes: number[] = [];
    for (let n = 0; ; n++) {
      expect(n).toBeLessThan(8);
      const page = await nextMailPage(q, boxes, store.cachedPage, (id, source, limit) =>
        readOlderSource(
          providers.get(id)!,
          q,
          id,
          source,
          limit,
          (ids) => store.cachedDates(id, ids),
          (messages) => store.cacheOlder(id, "grant", messages),
        ),
      );
      expect(page.issue).toBeUndefined();
      sizes.push(page.items.length);
      for (const m of page.items) {
        q.seen.push(conversationKey(m));
        order.push(m.timestamp);
      }
      q.sources = page.sources;
      if (!page.hasMore) break;
    }
    expect(q.seen).toHaveLength(90);
    expect(sizes).toEqual([50, 40]);
    expect(new Set(q.seen).size).toBe(90);
    expect(order).toEqual([...order].sort((a, b) => b - a));
    expect(lists.filter((n) => n === "quiet")).toHaveLength(1);
    expect(fetched).toHaveLength(88);
    expect(fetched).not.toContain("busy-2");
    const saved = await store.list({
      mailboxId: null,
      view: "inbox",
      search: "busy-2",
    });
    const original = saved.items.find((m) => m.subject === "busy-2")!;
    expect(await store.body(original.id)).toEqual({ format: "plain", text: "Original 2" });
    for (const box of boxes)
      expect(await store.connection(box.id)).toMatchObject({
        cursor,
        lastSync: box.lastSync,
        protectedGrant: "grant",
      });
    await store.disconnect(original.mailboxId);
    await rejects(store.cacheOlder(original.mailboxId, "grant", []), /authorization changed/);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a page with a few free slots still reads a batch of IDs, not one per round trip", async () => {
  const shown = (i: number): MailConversation => ({
    id: `m${i}`,
    mailboxId: "box",
    subject: "",
    from: "",
    to: "",
    timestamp: 10_000 - i,
    snippet: "",
    flags: mailFlag.inbox,
    labelIds: [],
    threadId: null,
    messageCount: 1,
    unreadMessages: 0,
    hasUnread: false,
    hasStar: false,
  });
  const limits: number[] = [];
  const q: OlderMailQuery = {
    mailboxId: null,
    view: "inbox",
    search: "",
    before: 20_000,
    // Earlier reads reached the 48th cached conversation, and Gmail has more.
    sources: [{ mailboxId: "box", before: 20_000, token: "next", through: 10_000 - 47 }],
    seen: [],
  };
  const page = await nextMailPage(
    q,
    [{ id: "box", status: "idle" }],
    // 48 of 50 slots are filled; the mailbox may still hold older mail.
    async () => ({ items: Array.from({ length: 48 }, (_, i) => shown(i)), hasMore: false }),
    async (mailboxId, _source, limit) => {
      limits.push(limit);
      return { mailboxId, before: q.before, token: null, through: 0 };
    },
  );
  expect(page.items).toHaveLength(48);
  expect(limits).toEqual([10]);
});

test("an expired older-page token restarts at the overlapping second with the same label and search", async () => {
  const q: OlderMailQuery = {
    mailboxId: "one",
    label: { mailboxId: "one", id: "Label_42" },
    view: "inbox",
    search: "Invoice",
    before: 189000,
    seen: [],
    sources: [],
  };
  const queries: URLSearchParams[] = [];
  const reader = gmailReader(
    async () => "synthetic",
    new AbortController().signal,
    async (url) => {
      queries.push(url.searchParams);
      return url.searchParams.has("pageToken")
        ? new Response(null, { status: 400 })
        : Response.json({ messages: [{ id: "already-cached" }], nextPageToken: "fresh" });
    },
  );
  const source = await readOlderSource(
    reader,
    q,
    "one",
    { mailboxId: "one", before: 189000, through: 126005, token: "expired" },
    50,
    async () => new Map([["already-cached", 126005]]),
    async (ms) => {
      expect(ms).toEqual([]);
    },
  );
  expect(queries.map((p) => p.get("q"))).toEqual(['before:190 "Invoice"', 'before:127 "Invoice"']);
  expect(queries.map((p) => p.get("labelIds"))).toEqual(["Label_42", "Label_42"]);
  expect(source).toEqual({ mailboxId: "one", before: 126005, through: 126005, token: "fresh" });
});
