import type { SyncPage } from "@substrate/client-storage/mail";
import { mailFlag } from "@substrate/contracts/mail";

import { DesktopSessionAuthority } from "../session/desktop-session-authority.ts";
import { syncMailbox } from "./provider.ts";
import { createMailSession } from "./session.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const owner = { userId: "user", organizationId: "first" };
type FixtureBackend = {
  scope: typeof owner;
  inbox: boolean;
  beforeNextCheck?: () => Promise<void>;
};
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "mail-session-"));
  const backend: FixtureBackend = { scope: owner, inbox: true };
  const authority = new DesktopSessionAuthority({
    backend: "https://api.example.test",
    fetchAPI: async (url) => {
      if (new URL(url).pathname === "/api/auth/get-session") {
        const pause = backend.beforeNextCheck,
          scope = backend.scope;
        backend.beforeNextCheck = undefined;
        await pause?.();
        return Response.json({
          user: { id: scope.userId, emailVerified: true },
          session: { activeOrganizationId: scope.organizationId },
        });
      }
      if (new URL(url).pathname === "/api/v1/organizations/apps")
        return Response.json({
          success: true,
          data: {
            organizationId: backend.scope.organizationId,
            enabledApps: backend.inbox ? ["messages", "agents", "inbox"] : ["messages", "agents"],
          },
        });
      return Response.json({ role: "member" });
    },
  });
  const session = createMailSession({ authority, accountsDirectory: dir }, () => {});
  const connect = (id: string) =>
    session.use(owner, (l) =>
      l.db.connect({
        provider: "gmail",
        providerAccountId: id,
        address: `${id}@example.test`,
        protectedGrant: "local-fixture",
        nickname: null,
      }),
    );
  return {
    session,
    authority,
    backend,
    connect,
    close: async () => {
      await session.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test("disabling Inbox fences native reads and sync; re-enabling reopens the same local mailbox", async () => {
  const f = await fixture();
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
  const f = await fixture(),
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
  const f = await fixture(),
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
  const f = await fixture(),
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
