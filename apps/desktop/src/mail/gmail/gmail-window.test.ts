import { openMailStore } from "@substrate/client-storage/mail";

import { gmailReader } from "./gmail-reader.ts";
import { syncMailbox } from "../provider.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a legacy backfill switches to the newest 50, publishes the first batch, and resumes without paging into older mail", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mail-window-")),
    path = join(dir, "mail.sqlite");
  let db = await openMailStore(path, "org");
  const signal = new AbortController().signal,
    fetched: string[] = [];
  let lists = 0,
    fail = true;
  const reader = gmailReader(
    async () => "fixture",
    signal,
    async (url) => {
      const endpoint = url.pathname.split("/me/")[1]!;
      if (endpoint === "labels") return Response.json({});
      if (endpoint === "profile") return Response.json({ historyId: "12" });
      if (endpoint === "messages") {
        if (url.searchParams.get("labelIds") === "UNREAD") return Response.json({});
        lists++;
        expect(url.searchParams.has("q")).toBe(false);
        const token = url.searchParams.get("pageToken");
        if (!token) {
          expect(url.searchParams.get("maxResults")).toBe("50");
          return Response.json({
            messages: Array.from({ length: 11 }, (_, i) => ({ id: String(i) })),
            nextPageToken: "finish-first-page",
          });
        }
        expect(token).toBe("finish-first-page");
        expect(url.searchParams.get("maxResults")).toBe("39");
        return Response.json({
          messages: Array.from({ length: 39 }, (_, i) => ({ id: String(11 + i) })),
          nextPageToken: "another-thousand",
        });
      }
      if (!endpoint.startsWith("messages/")) throw new Error(`Unexpected ${endpoint}`);
      const id = endpoint.slice(9);
      if (fail && id === "4") return new Response(null, { status: 400 });
      fetched.push(id);
      return Response.json({
        id,
        internalDate: Date.now() - (10 + Number(id)) * 86_400_000,
        labelIds: ["INBOX"],
        payload: {},
      });
    },
  );
  try {
    const id = await db.connect({
      provider: "gmail",
      providerAccountId: "one",
      address: "one@example.test",
      nickname: null,
      protectedGrant: "fixture",
    });
    await db.commit(id, null, {
      cursor: JSON.stringify({
        kind: "full",
        baseline: "1",
        scan: "old",
        token: "ancient",
        pending: ["ancient"],
      }),
      done: false,
      messages: [],
      removed: [],
    });
    await rejects(syncMailbox(db, id, reader, signal), /Gmail read failed/);
    const query = { mailboxId: null, view: "inbox" as const, search: "" };
    expect((await db.list(query)).items).toHaveLength(4);
    db.close();
    db = await openMailStore(path, "org");
    const firstBatch = fetched.slice(0, 4);
    fetched.length = 0;
    fail = false;
    await syncMailbox(db, id, reader, signal);
    expect(lists).toBe(2);
    expect(new Set([...firstBatch, ...fetched]).size).toBe(50);
    expect(fetched).toHaveLength(46);
    expect((await db.list(query)).items).toHaveLength(50);
    expect(JSON.parse((await db.connection(id))!.cursor!)).toEqual({
      kind: "history",
      after: "12",
    });
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("paginated history resumes at the saved token, keeps later deletions and reads only recent bodies", async () => {
  const details: string[] = [];
  const tokens: (string | null)[] = [];
  const read = gmailReader(
    async () => "fixture",
    new AbortController().signal,
    async (url) => {
      const endpoint = url.pathname.split("/me/")[1]!;
      if (endpoint === "history") {
        expect(url.searchParams.get("startHistoryId")).toBe("10");
        const token = url.searchParams.get("pageToken");
        tokens.push(token);
        return Response.json({
          historyId: "20",
          nextPageToken: token ? undefined : "more-changes",
          history: [
            { messagesDeleted: [{ message: { id: token ? "deleted-later" : "deleted-first" } }] },
          ],
        });
      }
      if (endpoint === "profile") throw new Error("A new watermark would skip pending changes.");
      if (endpoint === "messages") {
        expect(url.searchParams.has("q")).toBe(false);
        return Response.json({ messages: [{ id: "one" }, { id: "two" }] });
      }
      const id = endpoint.slice(9);
      details.push(id);
      return Response.json({ id, internalDate: Date.now() - 100 * 86_400_000, payload: {} });
    },
  );
  const first = await read.page(JSON.stringify({ kind: "history", after: "10" }));
  expect(first.done).toBe(false);
  expect(first.removed).toEqual(["deleted-first"]);
  expect(details).toEqual([]);
  const page = await read.page(first.cursor);
  expect(page.done).toBe(true);
  expect(page.removed).toEqual(["deleted-later"]);
  expect(tokens).toEqual([null, "more-changes"]);
  expect(details).toEqual(["one", "two"]);
  expect(page.messages.map((m) => m.remoteId)).toEqual(details);
  expect(JSON.parse(page.cursor)).toEqual({ kind: "history", after: "20" });
});
