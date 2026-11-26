import { openMailStore } from "@substrate/client-storage/mail";

import { gmailReader } from "./gmail-reader.ts";
import { syncMailbox } from "../provider.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Gmail decodes each MIME part's declared charset, including an attached plain alternative", async () => {
  const b64 = (text: string) => Buffer.from(text, "latin1").toString("base64url");
  const page = await gmailReader(
    async () => "fixture",
    new AbortController().signal,
    async (url) => {
      const endpoint = url.pathname.split("/me/")[1];
      if (endpoint === "profile") return Response.json({ historyId: "1" });
      if (endpoint === "messages") return Response.json({ messages: [{ id: "a" }] });
      if (endpoint === "messages/a/attachments/p") return Response.json({ data: b64("Café") });
      if (endpoint !== "messages/a") throw new Error("Unexpected request");
      return Response.json({
        id: "a",
        internalDate: String(Date.now()),
        payload: {
          parts: [
            {
              mimeType: "text/html",
              headers: [{ name: "Content-Type", value: 'text/html; charset="windows-1252"' }],
              body: { data: b64("<p>\x80</p>") },
            },
            {
              mimeType: "text/plain",
              headers: [{ name: "content-type", value: "text/plain; charset=iso-8859-1" }],
              body: { data: "", attachmentId: "p" },
            },
          ],
        },
      });
    },
  ).page(null);
  expect(page.messages[0]?.body).toEqual({ format: "html", text: "<p>€</p>", plainText: "Café" });
});

test("a missing MIME attachment falls back to the other body instead of deleting the message", async () => {
  const reader = gmailReader(
    async () => "test",
    new AbortController().signal,
    async (url) => {
      const path = url.pathname.split("/me/")[1];
      if (path === "messages/kept/attachments/missing" || path === "messages/deleted")
        return new Response(null, { status: 404 });
      if (path === "profile") return Response.json({ historyId: "10" });
      if (path === "messages")
        return Response.json({ messages: [{ id: "kept" }, { id: "deleted" }] });
      return Response.json({
        id: "kept",
        internalDate: 1,
        payload: {
          parts: [
            { mimeType: "text/html", body: { attachmentId: "missing" } },
            {
              mimeType: "text/plain",
              body: { data: Buffer.from("Still here").toString("base64url") },
            },
          ],
        },
      });
    },
  );
  const page = await reader.page(null);
  expect(page.removed).toEqual(["deleted"]);
  expect(page.messages).toMatchObject([
    { remoteId: "kept", body: { format: "plain", text: "Still here" } },
  ]);
});

test("bounded history updates labels and explicit deletions only in the source mailbox; expiry preserves other cached mail", async () => {
  const dir = await mkdtemp(join(tmpdir(), "substrate-mail-"));
  const path = join(dir, "mail.sqlite");
  const signal = new AbortController().signal;
  const store = await openMailStore(path, "workspace");
  const inbox = { mailboxId: null, view: "inbox" as const, search: "" };
  const grant = {
    provider: "gmail",
    providerAccountId: "one",
    address: "one@example.test",
    nickname: null,
    protectedGrant: "test ciphertext",
  };
  const files = new Map([
    ["a", ["INBOX", "UNREAD", "L1"]],
    ["b", ["INBOX"]],
    ["older", ["INBOX"]],
  ]);
  let changes = false;
  let expired = false;
  let labelName = "Design";
  const reader = gmailReader(
    async () => "test-access",
    signal,
    async (url, init) => {
      expect(init.method ?? "GET").toBe("GET");
      expect(url.origin).toBe("https://gmail.googleapis.com");
      const endpoint = url.pathname.split("/me/")[1]!;
      if (endpoint === "labels")
        return Response.json({
          labels: [
            { id: "INBOX", name: "INBOX", type: "system" },
            { id: "L1", name: labelName, type: "user" },
          ],
        });
      if (endpoint === "profile") return Response.json({ historyId: expired ? "80" : "10" });
      if (endpoint === "messages") {
        if (url.searchParams.get("labelIds") === "UNREAD")
          return Response.json({
            messages: [...files].flatMap(([id, labels]) =>
              labels.includes("UNREAD") ? [{ id }] : [],
            ),
          });
        expect(url.searchParams.get("includeSpamTrash")).toBe("true");
        expect(url.searchParams.has("q")).toBe(false);
        expect(url.searchParams.get("maxResults")).toBe("50");
        if (expired) return Response.json({ messages: [{ id: "b" }] });
        const recent = [...files.keys()].filter((id) => !changes || id !== "older");
        return Response.json({ messages: recent.map((id) => ({ id })) });
      }
      if (endpoint.startsWith("messages/")) {
        const id = endpoint.slice(9);
        if (!files.has(id)) return new Response(null, { status: 404 });
        if (changes && id === "older") {
          expect(url.searchParams.get("format")).toBe("minimal");
          return Response.json({ id, labelIds: files.get(id) });
        }
        return Response.json({
          id,
          internalDate: String(Date.now()),
          threadId: `thread-${id}`,
          labelIds: files.get(id),
          snippet: "snippet",
          payload: {
            headers: [
              { name: "From", value: "Ada <ada@example.test>" },
              { name: "Subject", value: id },
            ],
            mimeType: "multipart/alternative",
            parts: [
              {
                mimeType: "text/plain",
                body: { data: Buffer.from(`Complete text for ${id}`).toString("base64url") },
              },
            ],
          },
        });
      }
      if (endpoint === "history") {
        const after = url.searchParams.get("startHistoryId");
        if (expired && after !== "80") return new Response(null, { status: 404 });
        if (changes && after === "10")
          return Response.json({
            historyId: "30",
            history: [
              {
                labelsRemoved: [{ message: { id: "a" } }, { message: { id: "older" } }],
                messagesDeleted: [{ message: { id: "b" } }],
              },
            ],
          });
        return Response.json({ historyId: expired ? "81" : "20" });
      }
      throw new Error("Unexpected Gmail endpoint.");
    },
  );
  try {
    const box = await store.connect(grant);
    await syncMailbox(store, box, reader, signal);
    expect((await store.list(inbox)).items).toHaveLength(3);
    const original = (await store.list(inbox)).items.find((m) => m.subject === "a")!;
    expect(await store.body(original.id)).toEqual({ format: "plain", text: "Complete text for a" });
    expect((await store.list({ ...inbox, view: "unread" })).items).toHaveLength(1);
    expect(await store.connect({ ...grant, nickname: "Print" })).toBe(box);
    expect((await store.connection(box))?.cursor).toContain('"10"');
    const second = await store.connect({
      ...grant,
      providerAccountId: "two",
      address: "two@example.test",
    });
    await syncMailbox(store, second, reader, signal);
    changes = true;
    files.set("a", ["INBOX"]);
    files.set("older", ["STARRED", "L1"]);
    files.delete("b");
    labelName = "Renamed";
    await syncMailbox(store, box, reader, signal);
    expect((await store.list({ ...inbox, mailboxId: box })).items).toMatchObject([
      { id: original.id, labelIds: ["INBOX"] },
    ]);
    const starred = (await store.list({ ...inbox, mailboxId: box, view: "starred" })).items;
    expect(starred).toMatchObject([{ subject: "older", labelIds: ["STARRED", "L1"] }]);
    expect(await store.body(starred[0]!.id)).toMatchObject({ text: "Complete text for older" });
    expect((await store.list({ ...inbox, mailboxId: second })).items).toHaveLength(3);
    expect((await store.accounts()).find((b) => b.id === box)?.labels).toEqual([
      { id: "L1", name: "Renamed" },
    ]);
    expired = true;
    files.set("b", ["INBOX"]);
    await syncMailbox(store, box, reader, signal);
    expect(
      (await store.list({ ...inbox, mailboxId: box })).items.map((m) => m.subject).sort(),
    ).toEqual(["a", "b"]);
    expect(await store.body(original.id)).toMatchObject({ text: "Complete text for a" });
    const remaining = (await store.list({ ...inbox, mailboxId: box })).items[0]!;
    const other = await openMailStore(path, "other-workspace");
    try {
      expect(await other.accounts()).toEqual([]);
      expect(await other.body(remaining.id)).toBeNull();
      expect((await other.list({ ...inbox, mailboxId: box })).items).toHaveLength(0);
      expect(await other.connection(box)).toBeUndefined();
    } finally {
      other.close();
    }
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a long Gmail rate limit releases the mailbox for cached reads and a later sync", async () => {
  let requests = 0;
  const reader = gmailReader(
    async () => "test",
    AbortSignal.timeout(500),
    async () => {
      requests++;
      return new Response(null, { status: 429, headers: { "Retry-After": "3600" } });
    },
  );
  await rejects(reader.labels(), /Gmail read failed/);
  expect(requests).toBe(1);
});
