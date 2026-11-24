import { mailFlag } from "@substrate/contracts/mail";

import { gmailReader } from "./gmail-reader.ts";
import { applyMailActions } from "./message-actions.ts";
import { mailFixture, owner } from "./test-support.ts";
import { expect, test } from "bun:test";

test("a lost thread Trash reply is verified once, including uncached mail, without touching another mailbox's identical thread", async () => {
  const f = await mailFixture();
  try {
    const writable = await f.connect("work");
    const readonly = await f.connect("personal");
    await f.session.use(owner, async (local) => {
      const { db } = local;
      await db.reconnect(writable, {
        provider: "gmail",
        providerAccountId: "work",
        address: "work@example.test",
        canModify: true,
        protectedGrant: "local-fixture",
      });
      async function seed(box: string) {
        await db.commit(box, null, {
          cursor: "same-history",
          done: true,
          removed: [],
          unreadTotal: 10,
          messages: ["new", "previous"].map((id, i) => ({
            remoteId: id,
            threadId: "shared",
            timestamp: 2 - i,
            subject: id,
            from: "",
            to: "",
            snippet: "",
            labelIds: ["INBOX", "UNREAD", "family"],
            flags: mailFlag.inbox | mailFlag.unread,
            body: { format: "plain", text: id },
          })),
        });
        const [conversation] = (await db.list({ view: "inbox", mailboxId: box, search: "" })).items;
        return db.thread(conversation!.id);
      }
      const [first, second] = await seed(writable);
      const [other] = await seed(readonly);
      const calls: string[] = [];
      const reconciled: string[] = [];
      const remote = ["new", "previous", "only-in-gmail"].map((id) => ({
        id,
        labelIds: ["INBOX", "UNREAD", "family"],
      }));
      const ids = [first!.id, other!.id, second!.id, first!.id, crypto.randomUUID()];
      const results = await applyMailActions(
        local,
        ids,
        "conversation",
        "trashMessage",
        async (_l, id, signal, work) => {
          expect(id).toBe(writable);
          return work(
            gmailReader(
              async () => "test-token",
              signal,
              async (url, init) => {
                const path = url.pathname.split("/me/")[1]!;
                calls.push(`${init.method} ${path}`);
                if (path === "threads/shared/trash") {
                  for (const m of remote) m.labelIds = ["TRASH", "family", "UNREAD"];
                  throw new TypeError("Connection closed after Gmail applied the change.");
                }
                expect(url.searchParams.get("format")).toBe("minimal");
                return Response.json({ id: "shared", messages: remote });
              },
            ),
            () => "local-fixture",
          );
        },
        async (signal) => {
          await f.session.checked(owner, signal);
        },
        (_l, id) => reconciled.push(id),
      );
      expect(calls).toEqual(["POST threads/shared/trash", "GET threads/shared"]);
      expect(results.map((r) => r.result)).toEqual(["updated", "reconnect", "updated", "missing"]);
      expect(reconciled).toEqual([writable]);
      expect(remote[2]!.labelIds).toContain("TRASH");
      expect(await db.body(first!.id)).toEqual({ format: "plain", text: first!.subject });
      expect(await db.thread(first!.id)).toHaveLength(2);
      for (const m of await db.thread(first!.id))
        expect(m.flags).toBe(mailFlag.trash | mailFlag.unread);
      for (const m of await db.thread(other!.id))
        expect(m.flags).toBe(mailFlag.inbox | mailFlag.unread);
      expect(await db.connection(writable)).toMatchObject({
        unreadTotal: 8,
        cursor: "same-history",
      });
      expect(await db.connection(readonly)).toMatchObject({
        unreadTotal: 10,
        cursor: "same-history",
      });
    });
  } finally {
    await f.close();
  }
});
