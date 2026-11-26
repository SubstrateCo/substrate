import { mcpOutputOffloadBytes } from "@substrate/contracts/harness/mcp";
import { leaseTools, mcpTools } from "@substrate/contracts/harness/tools";
import { mailFlag } from "@substrate/contracts/mail";

import { agentInbox } from "../../mail/agent/agent-access.ts";
import { gmailReader } from "../../mail/gmail/gmail-reader.ts";
import { mailFixture } from "../../mail/test-support.ts";
import { agentId, organizationId, runtimeFixture } from "./test-support.ts";
import { expect, test } from "bun:test";

test("a bound home-agent DM finds older unread mail and reads its HTML privately without changing Gmail", async () => {
  const scope = { userId: "owner", organizationId };
  const mail = await mailFixture(scope);
  const box = await mail.connect("work");
  let labels = ["UNREAD", "INBOX"];
  const calls: string[] = [];
  const html =
    '<style>not body</style><p>Renewal &amp; season</p><img src="https://images.example.test/tracker">' +
    "💌".repeat(5500);
  const inbox = agentInbox(mail.session, async (_local, _id, signal, work) =>
    work(
      gmailReader(
        async () => "fixture",
        signal,
        async (url, init) => {
          calls.push(`${init.method ?? "GET"} ${url.pathname}`);
          expect(url.hostname).toBe("gmail.googleapis.com");
          if (url.pathname.endsWith("/messages")) {
            expect(url.searchParams.get("labelIds")).toBe("INBOX");
            expect(url.searchParams.get("q")).toContain('is:unread "Alex"');
            return Response.json({ messages: [{ id: "old" }] });
          }
          if (!url.pathname.endsWith("/messages/old")) throw new Error("Unexpected Gmail request");
          return Response.json({
            id: "old",
            threadId: "renewal",
            labelIds: labels,
            internalDate: 1,
            payload: {
              headers: [
                { name: "From", value: "Alex Chen" },
                { name: "Subject", value: "Renewal" },
              ],
              mimeType: "text/html",
              body: { data: Buffer.from(html).toString("base64url") },
            },
          });
        },
      ),
      () => "local-fixture",
    ),
  )(scope);
  const f = await runtimeFixture({ inbox });
  try {
    // The list representative of this thread is a sent reply; the matching email is not cached.
    await mail.session.use(scope, (l) =>
      l.db.commit(box, null, {
        cursor: "recent",
        done: true,
        removed: [],
        messages: Array.from({ length: 50 }, (_, i) => ({
          remoteId: `recent-${i}`,
          threadId: i === 0 ? "renewal" : null,
          from: "Owner",
          to: "",
          subject: i === 0 ? "Sent reply" : "Recent",
          timestamp: 100 + i,
          flags: mailFlag.sent,
          labelIds: ["SENT"],
          snippet: "",
          body: { format: "plain", text: "Sent content" },
        })),
      }),
    );
    await f.runtime.start();
    const dm = await f.message({ body: "Which unread emails did Alex send?" });
    const turn = f.turns()[0]!;
    const endpoint = f.toolEndpoint(turn.sessionId)!;
    expect(endpoint.tools).toContain("search_inbox");
    expect(leaseTools("helper", ["inbox"])).not.toContain("search_inbox");
    const search = () =>
      endpoint.call("search_inbox", { query: "Alex", unreadOnly: true, limit: 4 });
    const found = mcpTools.search_inbox.output.parse((await search()).structuredContent);
    expect(found.items).toMatchObject([
      { mailboxId: box, unread: true, from: "Alex Chen", subject: "Renewal" },
    ]);
    const messageId = found.items[0]!.messageId;
    await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
    await f.message({ conversationId: dm.conversationId, body: "What did the renewal one say?" });
    const followup = f.turns().at(-1)!;
    expect(followup.sessionId).toBe(turn.sessionId);
    const read = (offset = 0) =>
      f.toolEndpoint(followup.sessionId)!.call("read_inbox_message", { messageId, offset });
    const first = mcpTools.read_inbox_message.output.parse((await read()).structuredContent);
    expect(first.text).toContain("Renewal & season");
    expect(first.text).not.toMatch(/tracker|not body|<img/);
    expect(first.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(mcpOutputOffloadBytes);
    const second = mcpTools.read_inbox_message.output.parse(
      (await read(first.nextOffset!)).structuredContent,
    );
    expect(second.text.startsWith("💌")).toBe(true);
    expect((await mail.session.use(scope, (l) => l.db.inboxMessage(messageId, 0, 1)))?.flags).toBe(
      mailFlag.unread | mailFlag.inbox,
    );
    expect(calls.every((c) => c.startsWith("GET "))).toBe(true);
    labels = ["UNREAD"];
    expect((await read()).isError).toBe(true);
    mail.backend.inbox = false;
    expect((await search()).content[0].text).toContain("APP_DISABLED");
    mail.backend.inbox = true;
    mail.backend.scope = { ...scope, userId: "someone-else" };
    mail.authority.invalidate();
    expect((await search()).isError).toBe(true);
    await f.emit(followup.turnId, { type: "turn.completed", result: { status: "completed" } });
    expect((await search()).content[0].text).toContain("NO_TURN");
  } finally {
    await f.close();
    await mail.close();
  }
});

test("a shared thread, forged origin, or caller context cannot obtain the owner's mail; ending a turn fences in-flight results", async () => {
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  let searches = 0;
  const f = await runtimeFixture({
    capabilities: { steer: true },
    inbox: {
      search: async () => {
        searches++;
        entered.resolve();
        await release.promise;
        return { items: [], mailboxes: [], connectedMailboxes: 0, nextCursor: null };
      },
      read: async () => {
        throw new Error("Unexpected body read");
      },
    },
  });
  try {
    await f.runtime.start();
    const threadId = crypto.randomUUID();
    const place = await f.message({ threadId });
    const shared = f.turns()[0]!;
    const q = mcpTools.search_inbox.input.parse({});
    expect((await f.toolEndpoint(shared.sessionId)!.call("search_inbox", q)).isError).toBe(true);
    const caller = f.callerMessage({ conversationId: place.conversationId, threadId });
    await f.runtime.sync();
    await f.advance(600);
    expect(f.commands.find((c) => c.type === "steer")).toMatchObject({
      turnId: shared.turnId,
      invocationIds: [caller.invocationId],
    });
    expect(
      (await f.toolEndpoint(shared.sessionId)!.call("search_inbox", q)).content[0].text,
    ).toContain("FORBIDDEN");
    await f.emit(shared.turnId, { type: "turn.completed", result: { status: "completed" } });
    await f.message();
    const dm = f.turns().at(-1)!;
    for (const turn of [
      { ...dm.context, origin: { conversationId: crypto.randomUUID(), threadId: null } },
      { ...dm.context, invocationIds: [crypto.randomUUID()] },
      { ...dm.context, kind: "unattended" as const },
      { ...dm.context, attempt: dm.context.attempt + 1 },
    ]) {
      expect(
        (
          await f.runtime.handleLocalTool({
            tool: "search_inbox",
            organizationId,
            agentId,
            turn,
            sessionId: dm.sessionId,
            input: {},
          })
        ).success,
      ).toBe(false);
    }
    const endpoint = f.toolEndpoint(dm.sessionId)!;
    f.catalog[0]!.home = false;
    expect((await endpoint.call("search_inbox", q)).content[0].text).toContain("FORBIDDEN");
    expect(searches).toBe(0);
    f.catalog[0]!.home = true;
    const call = endpoint.call("search_inbox", q);
    await entered.promise;
    await f.emit(dm.turnId, { type: "turn.completed", result: { status: "completed" } });
    release.resolve();
    expect((await call).isError).toBe(true);
    expect(searches).toBe(1);
  } finally {
    release.resolve();
    await f.close();
  }
});
