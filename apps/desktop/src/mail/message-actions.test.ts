import { openMailStore } from "@substrate/client-storage/mail";
import { mailFlag, type MailMessageAction } from "@substrate/contracts/mail";

import { gmailReader } from "./gmail-reader.ts";
import { applyMailActions } from "./message-actions.ts";
import { syncMailbox } from "./provider.ts";
import { mailboxSyncJobs } from "./sync-jobs.ts";
import { expect, test } from "bun:test";

test("one Gmail message changes once, including after a lost response; siblings, other mailboxes and history survive", async () => {
  const db = await openMailStore(":memory:", "org");
  const local = {
    db,
    jobs: mailboxSyncJobs(),
    abort: new AbortController(),
    auth: { accountKey: "a", userId: "owner", identity: "a", organizationId: "org" },
  };
  const labels = ["INBOX", "UNREAD", "project"];
  let state = [...labels];
  let mode: "ok" | "sparse" | "lost" | "limited" | "denied" | "missing" = "ok";
  const calls: string[] = [];
  const reader = gmailReader(
    async () => "token",
    local.abort.signal,
    async (url, init) => {
      calls.push(`${init.method} ${url.pathname.split("/me/")[1]}`);
      if (mode === "missing") return new Response(null, { status: 404 });
      if (mode === "limited") return new Response(null, { status: 429 });
      if (mode === "denied")
        return Response.json(
          { error: { errors: [{ reason: "insufficientPermissions" }] } },
          { status: 403 },
        );
      if (init.method === "POST") {
        if (url.pathname.endsWith("/modify")) {
          if (init.body === '{"addLabelIds":["UNREAD"]}')
            state = [...new Set([...state, "UNREAD"])];
          else {
            expect(init.body).toBe('{"removeLabelIds":["UNREAD"]}');
            state = state.filter((l) => l !== "UNREAD");
          }
          if (mode === "sparse") return Response.json({ id: "target" });
        } else {
          state = ["TRASH", "project"];
          if (mode === "lost") throw new TypeError("lost response");
        }
      }
      return Response.json({ id: "target", labelIds: state });
    },
  );
  try {
    const boxes = await Promise.all(
      ["a", "b"].map((providerAccountId) =>
        db.connect({
          provider: "gmail",
          providerAccountId,
          address: `${providerAccountId}@example.test`,
          nickname: null,
          canModify: true,
          protectedGrant: "grant",
        }),
      ),
    );
    const box = boxes[0]!;
    for (const id of boxes)
      await db.commit(id, null, {
        cursor: "checkpoint",
        done: true,
        removed: [],
        unreadTotal: 12,
        messages: ["target", "sibling"].map((remoteId, i) => ({
          remoteId,
          threadId: "t",
          subject: remoteId,
          timestamp: 10 - i,
          from: "",
          to: "",
          snippet: "",
          labelIds: labels,
          flags: mailFlag.inbox | mailFlag.unread,
          body: { format: "plain", text: "kept" },
        })),
      });
    const target = (await db.list({ view: "inbox", mailboxId: box, search: "" })).items[0]!.id;
    const change = async (action: MailMessageAction) =>
      (
        await applyMailActions(
          local,
          [target],
          "message",
          action,
          (_l, _id, _s, work) => work(reader, () => "grant"),
          async () => {},
          () => {},
        )
      )[0]!.result;
    mode = "limited";
    expect(await change("markRead")).toBe("retry");
    expect((await db.connection(box))?.unreadTotal).toBe(12);
    mode = "sparse";
    const twice = await Promise.all([change("markRead"), change("markRead")]);
    expect(twice).toEqual(["updated", "updated"]);
    const updated = (await db.list({ view: "inbox", mailboxId: box, search: "" })).items[0]!;
    expect((await db.thread(updated.id)).find((m) => m.subject === "target")?.labelIds).toEqual([
      "INBOX",
      "project",
    ]);
    mode = "ok";
    expect(await change("markUnread")).toBe("updated");
    expect((await db.connection(box))?.unreadTotal).toBe(12);
    mode = "lost";
    expect(await change("trashMessage")).toBe("updated");
    expect(calls.slice(-2)).toEqual(["POST messages/target/trash", "GET messages/target"]);
    const page = (view: "trash" | "unread") => db.list({ view, mailboxId: box, search: "" });
    const trashed = (await page("trash")).items[0]!;
    expect(trashed.subject).toBe("target");
    expect((await page("unread")).items[0]?.subject).toBe("sibling");
    expect(await db.body(trashed.id)).toEqual({ text: "kept", format: "plain" });
    expect(await db.connection(box)).toMatchObject({ unreadTotal: 11, cursor: "checkpoint" });
    expect(await db.connection(boxes[1]!)).toMatchObject({ unreadTotal: 12 });
    // The owner restores and marks unread in Gmail. History replay uses the same local ID.
    mode = "ok";
    state = [...labels];
    await syncMailbox(
      db,
      box,
      {
        labels: async () => [],
        unreadIds: async () => [
          "target",
          "sibling",
          ...Array.from({ length: 10 }, (_, i) => `uncached-${i}`),
        ],
        page: async (cursor) => ({
          cursor: "restored",
          done: true,
          messages: [],
          removed: [],
          changedIds: cursor === "checkpoint" ? ["target"] : [],
        }),
        messageLabels: reader.messageLabels,
      },
      local.abort.signal,
    );
    expect(await db.inboxMessage(trashed.id, 0, 20)).toMatchObject({ flags: 3, text: "kept" });
    expect((await db.connection(box))?.unreadTotal).toBe(12);
    mode = "denied";
    expect(await change("markRead")).toBe("reconnect");
    expect((await db.connection(box))?.canModify).toBe(false);
    const count = calls.length;
    expect(await change("markRead")).toBe("reconnect");
    expect(calls).toHaveLength(count);
    await db.reconnect(box, {
      provider: "gmail",
      providerAccountId: "a",
      address: "a@example.test",
      canModify: true,
      protectedGrant: "grant",
    });
    mode = "missing";
    expect(await change("trashMessage")).toBe("missing");
    expect(await db.body(trashed.id)).toBeNull();
    expect((await db.connection(box))?.unreadTotal).toBe(11);
  } finally {
    db.close();
  }
});
