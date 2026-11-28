import { InboxToolError } from "@substrate/agent-host";
import { mailListWorker, openMailStore, type MailStore } from "@substrate/client-storage/mail";
import type { MailScope } from "@substrate/contracts/mail/ipc";

import {
  type Authorization,
  type DesktopSessionAuthority,
  HarnessAccessDenied,
} from "../session/desktop-session-authority.ts";
import { mailboxSyncJobs } from "./sync-jobs.ts";
import { addAbortListener } from "node:events";
import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type MailSessionOptions = {
  authority: DesktopSessionAuthority;
  accountsDirectory: string;
  migrationsDirectory?: string;
  mailListWorkerEntry?: string;
};
export type LocalMail = {
  db: Omit<MailStore, "close">;
  auth: Authorization;
  abort: AbortController;
  jobs: ReturnType<typeof mailboxSyncJobs>;
};
type Active = LocalMail & {
  inFlight: Set<Promise<unknown>>;
  reads: ReturnType<typeof mailListWorker>;
  closeWriter(): void;
};

async function filePath(accounts: string, key: string) {
  let dir = accounts;
  for (const segment of [key, ".substrate"]) {
    dir = join(dir, segment);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if (!(await lstat(dir)).isDirectory()) throw new Error("Invalid local mail directory.");
  }
  const path = join(dir, "mail.sqlite");
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    const stat = await lstat(file).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
    });
    if (stat && !stat.isFile()) throw new Error("Invalid mail storage path.");
  }
  return path;
}

export function createMailSession(
  options: MailSessionOptions,
  resume: (local: LocalMail, id: string) => void,
) {
  let current: Active | undefined,
    epoch = 0;
  let lifecycle = Promise.resolve();
  function transition<T>(fn: () => Promise<T>) {
    const result = lifecycle.then(fn);
    lifecycle = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  function checkEpoch(generation: number) {
    if (generation !== epoch) throw new Error("Session changed.");
  }
  function stop(reason?: Error) {
    epoch++;
    current?.abort.abort(reason);
    return transition(async () => {
      const old = current;
      current = undefined;
      if (!old) return;
      await Promise.allSettled([old.reads.close(), old.jobs.stop(), ...old.inFlight]);
      old.closeWriter();
    });
  }
  options.authority.onChange(() => {
    void stop();
  });

  async function checked(scope: MailScope, signal?: AbortSignal) {
    const generation = options.authority.generation;
    signal?.throwIfAborted();
    const cancelled = Promise.withResolvers<never>();
    const listener = signal && addAbortListener(signal, () => cancelled.reject(signal.reason));
    try {
      const verify = async () => {
        const auth = await options.authority.verify();
        signal?.throwIfAborted();
        checkAuthority();
        const [, apps] = await Promise.all([
          options.authority.confirm(auth, signal),
          options.authority.readAppSettings(auth, signal),
        ]);
        signal?.throwIfAborted();
        checkAuthority();
        if (!apps.enabledApps.includes("inbox")) {
          const error = new InboxToolError("APP_DISABLED", "Inbox is disabled.");
          if (current?.auth.organizationId === auth.organizationId) void stop(error);
          throw error;
        }
        return auth;
      };
      const auth = await (signal ? Promise.race([verify(), cancelled.promise]) : verify());
      if (auth.userId !== scope.userId || auth.organizationId !== scope.organizationId)
        throw new Error("Workspace changed.");
      return auth;
    } catch (error) {
      if (
        error instanceof HarnessAccessDenied &&
        !signal?.aborted &&
        generation === options.authority.generation
      )
        options.authority.invalidate();
      throw error;
    } finally {
      listener?.[Symbol.dispose]();
    }
    function checkAuthority() {
      if (generation !== options.authority.generation) throw new Error("Session changed.");
    }
  }
  async function use<T>(scope: MailScope, work: (local: LocalMail) => Promise<T>): Promise<T> {
    const generation = epoch,
      auth = await checked(scope);
    checkEpoch(generation);
    const matches = (l: LocalMail) =>
      l.auth.accountKey === auth.accountKey && l.auth.organizationId === auth.organizationId;
    let local = current;
    if (local && !local.abort.signal.aborted && !matches(local)) {
      await stop();
      return use(scope, work);
    }
    if (!local || local.abort.signal.aborted) {
      local = await transition(async () => {
        checkEpoch(generation);
        if (current) {
          if (!matches(current)) throw new Error("Session changed.");
          return current;
        }
        const path = await filePath(options.accountsDirectory, auth.accountKey);
        const store = await openMailStore(path, auth.organizationId, options.migrationsDirectory);
        try {
          const pending = await store.pendingSync();
          checkEpoch(generation);
          const reads = mailListWorker(path, auth.organizationId, options.mailListWorkerEntry);
          const active: Active = {
            db: {
              ...store,
              accounts: reads.accounts,
              unreadDifferences: reads.unreadDifferences,
              list: reads.list,
              cachedPage: reads.cachedPage,
              inboxHeaders: reads.inboxHeaders,
              inboxMessage: reads.inboxMessage,
            },
            reads,
            closeWriter: store.close,
            auth,
            abort: new AbortController(),
            jobs: mailboxSyncJobs(),
            inFlight: new Set(),
          };
          current = active;
          for (const { id } of pending) resume(active, id);
          return active;
        } catch (error) {
          store.close();
          throw error;
        }
      });
    }
    checkEpoch(generation);
    local.abort.signal.throwIfAborted();
    const result = work(local);
    local.inFlight.add(result);
    try {
      const value = await result;
      checkEpoch(generation);
      return value;
    } finally {
      local.inFlight.delete(result);
    }
  }
  return { use, stop, checked };
}
