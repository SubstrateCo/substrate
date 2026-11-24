import { mailFlag } from "@substrate/contracts/mail";

import { openMailStore, type SyncPage } from "./store.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("reconnect keeps the verified mailbox and checkpoint; disconnect purges only its local copies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mail-connections-"));
  const path = join(dir, "mail.sqlite");
  const local = await openMailStore(path, "alpha");
  const other = await openMailStore(path, "beta");
  const source = {
    provider: "gmail",
    providerAccountId: "one",
    address: "one@example.test",
    nickname: "Office",
    protectedGrant: "old-grant",
  };
  const second = {
    ...source,
    providerAccountId: "two",
    address: "two@example.test",
    protectedGrant: "other-grant",
  };
  const page: SyncPage = {
    cursor: "checkpoint",
    done: true,
    removed: [],
    messages: [
      {
        remoteId: "same-id",
        threadId: null,
        timestamp: 1,
        subject: "Shared subject",
        from: "sender@example.test",
        to: "",
        flags: mailFlag.inbox,
        labelIds: ["Label_1"],
        snippet: "Preview",
        body: { text: "Full message", format: "plain" },
      },
    ],
  };
  const query = { mailboxId: null, view: "inbox" as const, search: "" };
  try {
    const a = await local.connect(source);
    const b = await local.connect(second);
    const c = await other.connect(source);
    for (const [db, id] of [
      [local, a],
      [local, b],
      [other, c],
    ] as const) {
      await db.labels(id, [{ id: "Label_1", name: "Invoices" }]);
      await db.commit(id, null, page);
    }
    const first = (await local.list({ ...query, mailboxId: a })).items[0]!;
    expect((await local.connection(a))?.canModify).toBe(false);
    expect(await local.reconnect(a, second)).toBe(false);
    expect(await other.reconnect(a, source)).toBe(false);
    expect((await local.connection(a))?.protectedGrant).toBe("old-grant");
    await local.rename(a, "  Press  ");
    expect(
      await local.reconnect(a, {
        ...source,
        address: "new@example.test",
        canModify: true,
        protectedGrant: "new-grant",
      }),
    ).toBe(true);
    expect(await local.connection(a)).toMatchObject({
      id: a,
      nickname: "Press",
      address: "new@example.test",
      canModify: true,
      protectedGrant: "new-grant",
      cursor: "checkpoint",
    });
    await rejects(local.rotateGrant(a, "old-grant", "late-rotation"), /authorization changed/);
    await rejects(local.applyMessageState(a, "one", "old-grant", null), /authorization changed/);
    await local.disableWrites(a, "old-grant");
    await local.fail(a, "old-grant", "reconnect");
    await local.rotateGrant(a, "new-grant", "rotated-grant");
    expect(await local.connection(a)).toMatchObject({
      protectedGrant: "rotated-grant",
      canModify: true,
      status: "idle",
      cursor: "checkpoint",
    });
    await local.rename(a, "   ");
    expect((await local.accounts()).find((row) => row.id === a)?.nickname).toBeNull();
    await other.disconnect(a);
    expect((await local.list(query)).items).toHaveLength(2);
    await local.disconnect(a);
    expect(await local.accounts()).toMatchObject([{ id: b, labels: [{ name: "Invoices" }] }]);
    expect(await local.body(first.id)).toBeNull();
    expect(await local.connection(a)).toBeUndefined();
    expect(await local.reconnect(a, source)).toBe(false);
    await rejects(local.commit(a, "checkpoint", { ...page, cursor: "late" }), /checkpoint changed/);
    expect((await local.list(query)).items).toHaveLength(1);
    expect((await other.list(query)).items).toHaveLength(1);
    const race = await Promise.allSettled(
      ["left", "right"].map((cursor) => local.commit(b, "checkpoint", { ...page, cursor })),
    );
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await local.list(query)).items).toHaveLength(1);
  } finally {
    local.close();
    other.close();
    await rm(dir, { recursive: true, force: true });
  }
});
