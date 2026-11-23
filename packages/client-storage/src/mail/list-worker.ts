import type { Mailbox, MailPage } from "@substrate/contracts/mail";
import type { MailFolder, OlderMailQuery } from "@substrate/contracts/mail/ipc";

import type { EventEmitter } from "node:events";
import { MessageChannel, Worker, type MessagePort } from "node:worker_threads";

type Read =
  | { kind: "accounts" }
  | { kind: "unreadDifferences"; mailbox: string; ids: string[] }
  | { kind: "list"; query: MailFolder }
  | { kind: "cachedPage"; query: OlderMailQuery };
export type ListRequest = { reply: MessagePort } & Read;

/** A single reader per verified workspace. Writes keep the WAL connection in main; searches
 * and conditional label counts cannot block Electron's event loop or the writer's queue. */
export function mailListWorker(
  path: string,
  org: string,
  entry: URL | string = new URL("./list-worker-entry.ts", import.meta.url),
) {
  // SAFETY: node:worker_threads.Worker is an EventEmitter in Node, Electron and Bun.
  // The mixed Bun/Node ambient declarations in the desktop typecheck omit that base class.
  const worker = new Worker(entry, { workerData: { path, org }, execArgv: [] }) as Worker &
    Pick<EventEmitter, "once">;
  const pending = new Set<() => void>();
  let closed = false;
  function ended() {
    closed = true;
    for (const fail of pending) fail();
  }
  worker.once("error", ended);
  worker.once("exit", ended);
  function read<T>(request: Read): Promise<T> {
    if (closed) return Promise.reject(new Error("Mail reader closed."));
    return new Promise((resolve, reject) => {
      const { port1, port2 } = new MessageChannel();
      const cleanup = () => {
        pending.delete(fail);
        port1.close();
      };
      const fail = () => {
        cleanup();
        reject(new Error("Local mail read failed."));
      };
      pending.add(fail);
      port1.once("message", (result: T | null) => {
        if (result === null) return fail();
        cleanup();
        resolve(result);
      });
      try {
        worker.postMessage({ ...request, reply: port2 } satisfies ListRequest, [port2]);
      } catch {
        port2.close();
        fail();
      }
    });
  }
  return {
    accounts: () => read<Mailbox[]>({ kind: "accounts" }),
    unreadDifferences: (mailbox: string, ids: string[]) =>
      read<string[]>({ kind: "unreadDifferences", mailbox, ids }),
    list: (query: MailFolder) => read<MailPage>({ kind: "list", query }),
    cachedPage: (query: OlderMailQuery) =>
      read<Pick<MailPage, "items"> & { hasMore: boolean }>({ kind: "cachedPage", query }),
    close: async () => {
      ended();
      await worker.terminate();
    },
  };
}
