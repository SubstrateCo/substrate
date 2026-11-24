import type { ListRequest } from "./list-worker.ts";
import { openMailReads } from "./reads.ts";
import { parentPort, workerData } from "node:worker_threads";

// Worker data comes only from mailListWorker, after desktop main verifies the workspace.
const { path, org }: { path: string; org: string } = workerData;
const reads = openMailReads(path, org);
parentPort!.on("message", async (message: ListRequest) => {
  try {
    switch (message.kind) {
      case "inboxHeaders":
        message.reply.postMessage(await reads.inboxHeaders(message.query));
        break;
      case "inboxMessage":
        message.reply.postMessage(
          await reads.inboxMessage(message.id, message.offset, message.limit),
        );
        break;
      case "unreadDifferences":
        message.reply.postMessage(await reads.unreadDifferences(message.mailbox, message.ids));
        break;
      case "accounts":
        message.reply.postMessage(await reads.accounts());
        break;
      case "cachedPage":
        message.reply.postMessage(await reads.cachedPage(message.query));
        break;
      case "list":
        message.reply.postMessage(await reads.list(message.query));
        break;
    }
  } catch {
    message.reply.postMessage(null);
  } finally {
    message.reply.close();
  }
});
