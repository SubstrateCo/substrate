import { mcpOutputOffloadBytes } from "@substrate/contracts/harness/mcp";
import { mcpTools } from "@substrate/contracts/harness/tools";
import { mailFlag } from "@substrate/contracts/mail";

import { agentInbox } from "./agent-access.ts";
import { gmailReader } from "../gmail/gmail-reader.ts";
import { mailFixture, owner } from "../test-support.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

test("multi-mailbox search pages current Gmail and offline cache without duplicate, archived or sent siblings", async () => {
  const f = await mailFixture();
  let online = "";
  const query = mcpTools.search_inbox.input.parse({ query: "alex", unreadOnly: true, limit: 2 });
  const inbox = agentInbox(f.session, async (_local, id, signal, work) => {
    if (id !== online) throw new TypeError("Offline provider");
    return work(
      gmailReader(
        async () => "token",
        signal,
        async (url) => {
          if (url.pathname.endsWith("/messages")) {
            const token = Number(url.searchParams.get("pageToken") ?? 0);
            const ids = ["remote", "remote", "older"];
            return Response.json({
              messages: [{ id: ids[token] }],
              nextPageToken: token < 2 ? String(token + 1) : undefined,
            });
          }
          const remoteId = url.pathname.split("/").at(-1);
          return Response.json({
            id: remoteId,
            labelIds: ["UNREAD", "INBOX"],
            internalDate: 1,
            payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Alex" }] },
          });
        },
      ),
      () => "local-fixture",
    );
  })(owner);
  try {
    expect(await inbox.search(query)).toEqual({
      items: [],
      mailboxes: [],
      connectedMailboxes: 0,
      nextCursor: null,
    });
    online = await f.connect("a");
    const offline = await f.connect("b");
    await f.session.use(owner, (l) =>
      l.db.commit(offline, null, {
        cursor: "cached",
        done: true,
        removed: [],
        messages: ["first", "second", "archived", "sent reply", "spam"].map((subject, i) => ({
          remoteId: `m${i}`,
          threadId: "same",
          subject,
          from: "Alex",
          to: "",
          timestamp: 10 + i,
          snippet: "私💌\u0000".repeat(100),
          labelIds: [],
          body: { format: "plain", text: subject },
          flags: [
            3,
            3,
            mailFlag.unread,
            mailFlag.sent,
            mailFlag.inbox | mailFlag.unread | mailFlag.spam,
          ][i]!,
        })),
      }),
    );
    const first = await inbox.search(query);
    expect(first.mailboxes).toMatchObject([
      { mailboxId: online, coverage: "gmail" },
      { mailboxId: offline, coverage: "cached" },
    ]);
    expect(first.items.map((m) => m.subject)).toContain("second");
    expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(mcpOutputOffloadBytes);
    const cursor = first.nextCursor!;
    await rejects(inbox.search({ ...query, unreadOnly: false, cursor }), /Search changed/);
    await rejects(inbox.search({ ...query, mailboxId: online, cursor }), /Search changed/);
    const second = await inbox.search({ ...query, cursor });
    expect(second.items.map((m) => m.subject)).toEqual(["first"]);
    expect(await inbox.search({ ...query, cursor })).toMatchObject({ items: second.items });
    const last = await inbox.search({ ...query, cursor: second.nextCursor! });
    expect(last.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items, ...last.items].map((m) => m.messageId);
    expect(new Set(ids).size).toBe(4);
    expect(last.items).toMatchObject([{ mailboxId: online }]);
    const offlineMail = await inbox.read({ messageId: second.items[0]!.messageId, offset: 0 });
    expect(offlineMail).toMatchObject({ text: "first", coverage: "cached", unread: true });
    await f.session.use(owner, (l) => l.db.disconnect(offline));
    await rejects(inbox.read({ messageId: offlineMail.messageId, offset: 0 }), /no longer/);
    await rejects(inbox.search({ ...query, cursor }), /Search changed/);
  } finally {
    await f.close();
  }
});
