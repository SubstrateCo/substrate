import { contextTargetsLimit } from "@substrate/contracts/context/input";

import { ApiError } from "../result";
import { getMessageTargets, type MessageTarget } from "./links";

interface Pending {
  target: { conversationId: string; messageId: string };
  waiters: { resolve: (target: MessageTarget) => void; reject: (error: Error) => void }[];
}

const targetKey = (conversationId: string, messageId: string) => `${conversationId}:${messageId}`;

export function createMessageTargetLoader(request = getMessageTargets) {
  const queues = new Map<string, Map<string, Pending>>();

  function flush(organizationId: string) {
    const pending = [...(queues.get(organizationId)?.values() ?? [])];
    queues.delete(organizationId);
    for (let start = 0; start < pending.length; start += contextTargetsLimit) {
      const chunk = pending.slice(start, start + contextTargetsLimit);
      request({ data: { organizationId, targets: chunk.map((item) => item.target) } }).then(
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
              else
                waiter.reject(new ApiError("NOT_FOUND", "Item not found or access denied.", 404));
          }
        },
        (error: Error) => {
          for (const { waiters } of chunk) for (const waiter of waiters) waiter.reject(error);
        },
      );
    }
  }

  return (
    organizationId: string,
    conversationId: string,
    messageId: string,
  ): Promise<MessageTarget> =>
    new Promise((resolve, reject) => {
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

export const loadMessageTarget = createMessageTargetLoader();
