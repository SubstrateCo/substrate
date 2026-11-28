import { openMailStore, type SyncedMail } from "@substrate/client-storage/mail";
import { mailFlag } from "@substrate/contracts/mail";

import { nextMailPage, readOlderSource } from "../older-page.ts";
import { syncMailbox } from "../provider.ts";
import { gmailReader } from "./gmail-reader.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("sixteen Gmail unread messages: reconcile older cached labels, count uncached IDs, and load their bodies only on demand", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gmail-unread-"));
  const db = await openMailStore(join(dir, "mail.sqlite"), "workspace");
  const signal = new AbortController().signal;
  const { inbox, unread, spam } = mailFlag;
  const grant = {
    provider: "gmail",
    providerAccountId: "a",
    address: "a@example.test",
    nickname: null,
    protectedGrant: "fixture",
  };
  const cursor = JSON.stringify({ kind: "history", after: "10" });
  const q = { mailboxId: null, view: "unread" as const, search: "" };
  const old = Date.now() - 120 * 86_400_000;
  const cached = (remoteId: string, flags: number, threadId = remoteId): SyncedMail => ({
    remoteId,
    flags,
    threadId,
    timestamp: old,
    from: "",
    to: "",
    subject: remoteId,
    snippet: "",
    labelIds: ["project"],
    body: { format: "plain", text: `Saved ${remoteId}` },
  });
  const remote = new Map<string, string[]>([
    ["reply", ["INBOX", "UNREAD"]],
    ["first", ["INBOX", "UNREAD"]],
    ["now-read", ["INBOX", "project"]],
    ["now-unread", ["UNREAD", "STARRED"]],
    ["to-spam", ["SPAM", "UNREAD"]],
    ["to-trash", ["TRASH", "UNREAD"]],
    ["from-spam", ["UNREAD", "INBOX"]],
    ...Array.from({ length: 12 }, (_, i): [string, string[]] => [
      `uncached-${i}`,
      ["UNREAD", "INBOX"],
    ]),
  ]);
  const ids = [...remote].flatMap(([id, labels]) =>
    labels.includes("UNREAD") && !labels.includes("SPAM") && !labels.includes("TRASH") ? [id] : [],
  );
  const bodyReads: string[] = [],
    metadata: string[] = [];
  let offline = true,
    watermark = "10",
    snapshots = 0;
  const reader = gmailReader(
    async () => "fixture",
    signal,
    async (url, init) => {
      expect(init.method ?? "GET").toBe("GET");
      const path = url.pathname.split("/me/")[1]!;
      const p = url.searchParams;
      if (path === "labels")
        return Response.json({ labels: [{ id: "project", name: "Project", type: "user" }] });
      if (path === "history") return Response.json({ historyId: watermark });
      if (path === "messages") {
        expect(p.get("labelIds")).toBe("UNREAD");
        if (p.has("q")) return Response.json({ messages: ids.map((id) => ({ id })) });
        expect(p.get("includeSpamTrash")).toBe("false");
        expect(p.get("fields")).toBe("messages(id),nextPageToken");
        if (!p.has("pageToken")) {
          snapshots++;
          return Response.json({
            messages: ids.slice(0, 8).map((id) => ({ id })),
            nextPageToken: "rest",
          });
        }
        expect(p.get("pageToken")).toBe("rest");
        if (offline) return new Response(null, { status: 400 });
        return Response.json({ messages: ids.slice(7).map((id) => ({ id })) });
      }
      const id = path.slice("messages/".length);
      if (p.get("format") === "minimal") {
        expect(p.get("fields")).toBe("id,labelIds");
        metadata.push(id);
        return remote.has(id)
          ? Response.json({ id, labelIds: remote.get(id) })
          : new Response(null, { status: 404 });
      }
      expect(id.startsWith("uncached-")).toBe(true);
      bodyReads.push(id);
      return Response.json({ id, internalDate: old, labelIds: remote.get(id), payload: {} });
    },
  );
  try {
    const box = await db.connect(grant);
    const other = await db.connect({ ...grant, providerAccountId: "b", address: "b@example.test" });
    await db.commit(box, null, {
      done: true,
      cursor,
      removed: [],
      messages: [
        ...Array.from({ length: 50 }, (_, i) => ({
          ...cached(`recent-${i}`, inbox),
          timestamp: Date.now() - i,
        })),
        cached("reply", inbox | unread, "conversation"),
        cached("first", inbox | unread, "conversation"),
        cached("now-read", inbox | unread),
        cached("now-unread", 0),
        cached("from-spam", spam | unread),
        cached("to-spam", inbox | unread),
        cached("to-trash", inbox | unread),
        cached("gone", inbox | unread),
      ],
    });
    await db.commit(other, null, {
      done: true,
      cursor,
      removed: [],
      messages: [cached("now-read", inbox | unread)],
    });
    const original = (await db.list({ ...q, mailboxId: box, search: "now-read" })).items[0]!;
    const initial = await db.connection(box);
    await rejects(syncMailbox(db, box, reader, signal), /Gmail read failed/);
    expect(await db.connection(box)).toMatchObject({
      cursor,
      lastSync: initial!.lastSync,
      unreadTotal: null,
    });
    expect((await db.list(q)).unreadByMailbox).toEqual({ [box]: 6, [other]: 1 });
    offline = false;
    await syncMailbox(db, box, reader, signal);
    expect(bodyReads).toEqual([]);
    expect(metadata.sort()).toEqual([
      "from-spam",
      "gone",
      "now-read",
      "now-unread",
      "to-spam",
      "to-trash",
    ]);
    expect(await db.body(original.id)).toEqual({ format: "plain", text: "Saved now-read" });
    expect(await db.thread(original.id)).toMatchObject([
      { id: original.id, labelIds: ["INBOX", "project"], flags: inbox },
    ]);
    expect(
      (await db.list({ ...q, mailboxId: box })).items
        .map((m) => m.unreadMessages)
        .sort((a, b) => a - b),
    ).toEqual([1, 1, 2]);
    expect((await db.list(q)).unreadByMailbox).toEqual({ [box]: 16, [other]: 1 });
    expect((await db.list({ ...q, mailboxId: box, view: "spam" })).items).toMatchObject([
      { subject: "to-spam" },
    ]);
    expect((await db.list({ ...q, mailboxId: box, view: "trash" })).items).toMatchObject([
      { subject: "to-trash" },
    ]);
    expect((await db.list({ ...q, mailboxId: box, view: "starred" })).items).toMatchObject([
      { subject: "now-unread" },
    ]);
    const folder = { ...q, mailboxId: box, before: Date.now(), seen: [], sources: [] };
    const page = await nextMailPage(
      folder,
      await db.accounts(),
      db.cachedPage,
      (id, source, limit) =>
        readOlderSource(
          reader,
          folder,
          id,
          source,
          limit,
          (keys) => db.cachedDates(id, keys),
          (m) => db.cacheOlder(id, "fixture", m),
        ),
    );
    expect(page.items).toHaveLength(15);
    expect(page.items.reduce((n, m) => n + m.unreadMessages, 0)).toBe(16);
    expect(page.hasMore).toBe(false);
    expect(bodyReads).toHaveLength(12);
    expect((await db.list({ ...q, mailboxId: box })).unreadCount).toBe(16);
    await syncMailbox(db, box, reader, signal);
    expect(snapshots).toBe(2);
    ids.splice(ids.indexOf("from-spam"), 1);
    remote.set("from-spam", ["INBOX"]);
    watermark = "11";
    await syncMailbox(db, box, reader, signal);
    expect((await db.list({ ...q, mailboxId: box })).unreadCount).toBe(15);
    expect(bodyReads).toHaveLength(12);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
