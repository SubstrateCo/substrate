import { ApiError } from "../result";
import { getMessageTargets, type MessageTarget } from "./links";

// The server's batch limit.
const batchSize = 50;

interface Pending {
  target: { conversationId: string; messageId: string };
  waiters: { resolve: (target: MessageTarget) => void; reject: (error: Error) => void }[];
}

// Pending targets by organization, then by "conversationId:messageId".
const queues = new Map<string, Map<string, Pending>>();

const targetKey = (conversationId: string, messageId: string) => `${conversationId}:${messageId}`;

function flush(organizationId: string) {
  const pending = [...(queues.get(organizationId)?.values() ?? [])];
  queues.delete(organizationId);
  for (let start = 0; start < pending.length; start += batchSize) {
    const chunk = pending.slice(start, start + batchSize);
    getMessageTargets({ data: { organizationId, targets: chunk.map((item) => item.target) } }).then(
      (found) => {
        const byKey = new Map(
          found.map((target) => [
            targetKey(target.message.conversationId, target.message.id),
            target,
          ]),
        );
        for (const { target, waiters } of chunk) {
          const result = byKey.get(targetKey(target.conversationId, target.messageId));
          for (const waiter of waiters)
            if (result) waiter.resolve(result);
            // The batch leaves out what the viewer can't open. Fail as the single read does.
            else waiter.reject(new ApiError("NOT_FOUND", "Item not found or access denied.", 404));
        }
      },
      (error: Error) => {
        for (const { waiters } of chunk) for (const waiter of waiters) waiter.reject(error);
      },
    );
  }
}

/**
 * A message with its thread root. Reads started in the same task share one request per
 * organization, so a list of cards does not send one request per card.
 */
export function loadMessageTarget(
  organizationId: string,
  conversationId: string,
  messageId: string,
): Promise<MessageTarget> {
  return new Promise((resolve, reject) => {
    let queue = queues.get(organizationId);
    if (!queue) {
      queue = new Map<string, Pending>();
      queues.set(organizationId, queue);
      queueMicrotask(() => flush(organizationId));
    }
    const key = targetKey(conversationId, messageId);
    const pending = queue.get(key) ?? { target: { conversationId, messageId }, waiters: [] };
    pending.waiters.push({ resolve, reject });
    queue.set(key, pending);
  });
}
