import type { SyncPage } from "@substrate/client-storage/mail";
import { mailFlag } from "@substrate/contracts/mail";

import { syncMailbox } from "./provider.ts";
import { mailFixture, owner } from "./test-support.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
test("disabling Inbox fences native reads and sync; re-enabling reopens the same local mailbox", async () => {
  const f = await mailFixture();
  try {
    const id = await f.connect("original");
    const signal = await f.session.use(owner, async (local) => local.abort.signal);
    f.backend.inbox = false;
    await rejects(f.session.checked(owner, signal), /Inbox is disabled/);
    expect(signal.aborted).toBe(true);
    await rejects(
      f.session.use(owner, (local) => local.db.accounts()),
      /Inbox is disabled/,
    );
    f.backend.inbox = true;
    expect(await f.session.use(owner, (local) => local.db.accounts())).toMatchObject([{ id }]);
  } finally {
    await f.close();
  }
});

test("one stalled session check cannot block an authorized mailbox read or return old data after a switch", async () => {
  const f = await mailFixture(),
    entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  try {
    const box = await f.connect("first");
    f.backend.beforeNextCheck = () => {
      entered.resolve();
      return release.promise;
    };
    const stale = rejects(
      f.session.use(owner, (l) => l.db.accounts()),
      /Session changed/,
    );
    await entered.promise;
    expect(await f.session.use(owner, (l) => l.db.accounts())).toMatchObject([{ id: box }]);
    f.backend.scope = { ...owner, organizationId: "second" };
    f.authority.invalidate();
    expect(await f.session.use(f.backend.scope, (l) => l.db.accounts())).toEqual([]);
    release.resolve();
    await stale;
  } finally {
    release.resolve();
    await f.close();
  }
});

test("a workspace switch releases a sync waiting on an old session confirmation", async () => {
  const f = await mailFixture(),
    entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  try {
    const box = await f.connect("first");
    await f.session.use(owner, async (local) => {
      f.backend.beforeNextCheck = () => {
        entered.resolve();
        return release.promise;
      };
      void local.jobs
        .request(box, async (signal) => {
          await f.session.checked(local.auth, signal);
        })
        .catch(() => {});
    });
    await entered.promise;
    f.backend.scope = { ...owner, organizationId: "next" };
    f.authority.invalidate();
    const generation = f.authority.generation;
    expect(await f.session.use(f.backend.scope, (local) => local.db.accounts())).toEqual([]);
    release.resolve();
    await f.session.checked(f.backend.scope);
    expect(f.authority.generation).toBe(generation);
  } finally {
    release.resolve();
    await f.close();
  }
});

test("a mailbox waiting on a cancelled provider does not hold up another mailbox's checkpoint or reader", async () => {
  const f = await mailFixture(),
    entered = Promise.withResolvers<void>(),
    cancelled = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const page: SyncPage = {
    cursor: "synced",
    done: true,
    removed: [],
    messages: [
      {
        remoteId: "one",
        threadId: null,
        timestamp: Date.now(),
        from: "sender",
        to: "reader",
        subject: "Committed",
        snippet: "",
        labelIds: [],
        flags: mailFlag.inbox,
        body: { format: "plain", text: "Local body" },
      },
    ],
  };
  try {
    const [a, b] = await Promise.all([f.connect("a"), f.connect("b")]);
    await f.session.use(owner, async (l) => {
      void l.jobs
        .request(a, (signal) =>
          syncMailbox(
            l.db,
            a,
            {
              labels: async () => [],
              unreadIds: async () => [],
              messageLabels: async () => ({ messages: [], removed: [] }),
              page: async () => {
                signal.addEventListener("abort", () => cancelled.resolve(), { once: true });
                entered.resolve();
                await release.promise;
                return page;
              },
            },
            signal,
          ),
        )
        .catch(() => {});
    });
    await entered.promise;
    const retiring = f.session.use(owner, (l) => l.jobs.cancel(a));
    await cancelled.promise;
    await f.session.use(owner, (l) => l.db.commit(b, null, page));
    const list = await f.session.use(owner, (l) =>
      l.db.list({ mailboxId: null, view: "inbox", search: "" }),
    );
    expect(list.items).toMatchObject([{ mailboxId: b, subject: "Committed" }]);
    expect(await f.session.use(owner, (l) => l.db.body(list.items[0]!.id))).toEqual({
      format: "plain",
      text: "Local body",
    });
    release.resolve();
    await retiring;
    expect(await f.session.use(owner, (l) => l.db.connection(a))).toMatchObject({ cursor: null });
  } finally {
    release.resolve();
    await f.close();
  }
});
