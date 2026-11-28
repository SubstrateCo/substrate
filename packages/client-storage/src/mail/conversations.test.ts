import { conversationKey, filterLabels, mailFlag } from "@substrate/contracts/mail";

import { openMailStore, type SyncedMail } from "./store.ts";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("the opening page shows 50 matching conversations across any dates, after filtering and threading", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mail-window-"));
  const db = await openMailStore(join(dir, "mail.sqlite"), "workspace");
  try {
    const now = Date.now(),
      day = 86_400_000;
    const write = async (name: string, ages: number[]) => {
      const id = await db.connect({
        provider: "gmail",
        providerAccountId: name,
        address: `${name}@example.test`,
        nickname: null,
        protectedGrant: "fixture",
      });
      await db.commit(id, null, {
        cursor: "cached",
        done: true,
        removed: [],
        messages: ages.map((age, i) => ({
          remoteId: `${i}`,
          threadId: null,
          timestamp: now - age,
          subject: `${name}-${i}`,
          from: "",
          to: "",
          snippet: "",
          flags: mailFlag.inbox | mailFlag.unread,
          labelIds: [],
          body: { format: "plain", text: "" },
        })),
      });
      return id;
    };
    const busy = await write(
      "busy",
      Array.from({ length: 75 }, (_, i) => (i + 1) * day),
    );
    const quiet = await write("quiet", [day, 2 * day, 3 * day + 5_000, 10 * day]);
    const q = { mailboxId: null, view: "inbox" as const, search: "" };
    const first = await db.list(q);
    expect(first.items).toHaveLength(50);
    expect(first).toMatchObject({
      unreadCount: 79,
      unreadByMailbox: { [busy]: 75, [quiet]: 4 },
    });
    expect((await db.list({ ...q, mailboxId: quiet })).items.map((m) => m.subject)).toEqual([
      "quiet-0",
      "quiet-1",
      "quiet-2",
      "quiet-3",
    ]);
    const repeated = Array.from({ length: 55 }, (_, i): SyncedMail => ({
      remoteId: `reply-${i}`,
      threadId: "discussion",
      timestamp: now - i * 1000,
      flags: mailFlag.inbox,
      labelIds: [],
      subject: "Active thread",
      from: "",
      to: "",
      snippet: "",
      body: { format: "plain", text: "" },
    }));
    await db.commit(busy, "cached", {
      cursor: "next",
      done: true,
      removed: [],
      messages: [
        ...repeated,
        { ...repeated[0]!, remoteId: "sent-only", threadId: null, flags: mailFlag.sent },
      ],
    });
    const opening = (await db.list({ ...q, mailboxId: busy })).items;
    expect(opening).toHaveLength(50);
    expect(opening[0]).toMatchObject({ subject: "Active thread", messageCount: 55 });
    expect(opening.at(-1)?.subject).toBe("busy-48");
    expect((await db.list({ ...q, search: "quiet-3" })).items).toMatchObject([
      { subject: "quiet-3" },
    ]);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("older pages from the last shown time return every conversation once, also across ties", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mail-deep-"));
  const db = await openMailStore(join(dir, "mail.sqlite"), "workspace");
  try {
    const id = await db.connect({
      provider: "gmail",
      providerAccountId: "deep",
      address: "deep@example.test",
      nickname: null,
      protectedGrant: "fixture",
    });
    const times = Array.from({ length: 140 }, (_, i) => (i >= 40 && i < 70 ? 1_000 : 2_000 - i));
    await db.commit(id, null, {
      cursor: "cached",
      done: true,
      removed: [],
      messages: times.map((timestamp, i) => ({
        remoteId: `m${i}`,
        threadId: i % 7 === 0 ? `t${i % 3}` : null,
        timestamp,
        subject: `m${i}`,
        from: "",
        to: "",
        snippet: "",
        flags: mailFlag.inbox,
        labelIds: [],
        body: { format: "plain", text: "" },
      })),
    });
    const q = { mailboxId: null, view: "inbox" as const, search: "", sources: [], before: 5_000 };
    const pages = async (bounded: boolean) => {
      const shown: { id: string; key: string; timestamp: number }[] = [];
      for (;;) {
        const page = await db.cachedPage({
          ...q,
          seen: shown.map((row) => row.key),
          shownThrough: bounded ? shown.at(-1)?.timestamp : undefined,
        });
        shown.push(
          ...page.items.map((row) => ({
            id: row.id,
            key: conversationKey(row),
            timestamp: row.timestamp,
          })),
        );
        if (!page.hasMore) return shown.map((row) => row.id);
      }
    };
    const bounded = await pages(true);
    expect(new Set(bounded).size).toBe(bounded.length);
    expect(bounded).toEqual(await pages(false));
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("threads, unread totals, filtered matches and color overrides stay bound to their own mailbox", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mail-threads-")),
    file = join(dir, "fixture.sqlite");
  let db = await openMailStore(file, "workspace");
  const q = { mailboxId: null, view: "inbox" as const, search: "" };
  const mail = (
    id: string,
    threadId: string | null,
    date: number,
    flags: number,
    labelIds: string[] = [],
  ): SyncedMail => ({
    remoteId: id,
    threadId,
    timestamp: date,
    flags,
    labelIds,
    subject: id,
    from: "a@example.test",
    to: "b@example.test",
    snippet: "",
    body: { format: "plain", text: `Body: ${id}` },
  });
  const { inbox, unread, sent, trash } = mailFlag;
  try {
    const grant = {
      provider: "gmail",
      address: "a@example.test",
      providerAccountId: "a",
      protectedGrant: "fixture",
      nickname: null,
    };
    const a = await db.connect(grant),
      b = await db.connect({ ...grant, providerAccountId: "b", address: "b@example.test" });
    for (const id of [a, b])
      await db.labels(id, [{ id: "Label_1", name: id === a ? "Review" : "Home" }]);
    await db.commit(a, null, {
      messages: [
        mail("original", "t", 1, unread, ["Label_1"]),
        mail("received", "t", 2, inbox | unread, ["Label_1"]),
        mail("latest reply", "t", 4, sent),
        mail("in trash", "t", 6, trash | unread),
        mail("solo 1", null, 5, inbox),
        mail("solo 2", null, 5, inbox),
      ],
      removed: [],
      cursor: "a",
      done: true,
    });
    await db.commit(b, null, {
      messages: [mail("other private copy", "t", 3, inbox | unread, ["Label_1"])],
      removed: [],
      cursor: "b",
      done: true,
    });
    const all = await db.list(q);
    expect(all.items).toHaveLength(4);
    expect(all.unreadByMailbox).toEqual({ [a]: 2, [b]: 1 });
    const thread = all.items.find((row) => row.mailboxId === a && row.threadId === "t")!;
    expect(thread).toMatchObject({
      subject: "latest reply",
      messageCount: 4,
      unreadMessages: 2,
      hasUnread: true,
    });
    expect((await db.thread(thread.id)).map((m) => m.subject)).toEqual([
      "original",
      "received",
      "latest reply",
      "in trash",
    ]);
    expect(
      (await db.list({ ...q, label: { mailboxId: a, id: "Label_1" }, search: "original" })).items,
    ).toMatchObject([{ subject: "original", messageCount: 4 }]);
    expect(
      (await db.list({ ...q, mailboxId: b, label: { mailboxId: a, id: "Label_1" } })).items,
    ).toHaveLength(0);
    expect((await db.list({ ...q, view: "unread" })).items).toHaveLength(2);
    expect((await db.list({ ...q, view: "unread" })).unreadCount).toBe(3);
    const cursor = { sources: [], before: Date.now(), seen: [] };
    const tied = { ...q, search: "solo" };
    expect((await db.list(tied)).items).toEqual(
      (await db.cachedPage({ ...tied, ...cursor })).items,
    );
    const older = await db.cachedPage({ ...q, ...cursor });
    expect(older.items.find((row) => row.id === thread.id)).toEqual(thread);
    expect(
      (
        await db.cachedPage({
          ...q,
          ...cursor,
          search: "original",
          label: { mailboxId: a, id: "Label_1" },
        })
      ).items,
    ).toMatchObject([{ subject: "original", messageCount: 4 }]);
    expect(
      (
        await db.cachedPage({ ...q, ...cursor, seen: [JSON.stringify([a, "thread", "t"])] })
      ).items.map((row) => row.id),
    ).not.toContain(thread.id);
    await db.cacheOlder(a, "fixture", [mail("subsequent reply", "t", 7, sent)]);
    expect((await db.cachedPage({ ...q, ...cursor, before: 6 })).items.map((m) => m.id)).toContain(
      thread.id,
    );
    await db.labelColor(a, "Label_1", "Teal");
    const visible = async (mailbox: string) =>
      filterLabels((await db.accounts()).find((box) => box.id === mailbox)!).map((l) => l.id);
    await db.labelVisibility(a, { area: "sidebar", labelId: "Label_1", mode: "unread" });
    await db.labelVisibility(a, { area: "rows", labelId: "Label_1", visible: false });
    expect(await visible(a)).toEqual(["Label_1"]);
    await db.commit(a, "a", {
      messages: [],
      removed: ["original", "received"],
      cursor: "a2",
      done: true,
    });
    expect(await visible(a)).toEqual([]);
    expect(await visible(b)).toEqual(["Label_1"]);
    await db.labelVisibility(a, { area: "mailbox", visible: false });
    await db.labels(a, [{ id: "Label_1", name: "Reviewed" }]);
    db.close();
    db = await openMailStore(file, "workspace");
    expect((await db.connection(a))?.labels).toEqual([
      { id: "Label_1", name: "Reviewed", color: "Teal", filterMode: "unread", hideInRows: true },
    ]);
    expect((await db.connection(b))?.labels).toEqual([{ id: "Label_1", name: "Home" }]);
    expect((await db.accounts()).map((box) => box.showLabelFilters)).toEqual([false, true]);
    await db.labelVisibility(a, { area: "mailbox", visible: true });
    expect(await visible(a)).toEqual([]);
    await db.labelVisibility(a, { area: "sidebar", labelId: "Label_1", mode: "show" });
    await db.labelVisibility(a, { area: "rows", labelId: "Label_1", visible: true });
    await db.labelColor(a, "Label_1", null);
    expect((await db.connection(a))?.labels).toEqual([{ id: "Label_1", name: "Reviewed" }]);
    const other = await openMailStore(file, "other");
    try {
      expect(await other.thread(thread.id)).toEqual([]);
    } finally {
      other.close();
    }
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
