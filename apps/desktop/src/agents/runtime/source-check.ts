import type { InboxRow } from "@substrate/client-storage/agent-work";
import { triggerRegistry, type AgentSourcesResult } from "@substrate/contracts/agent-work";

/** The message, and for a call its invocation, that an item's source check reads. */
function sourceOf(item: InboxRow): { messageId: string; invocationId: string | null }[] {
  const { recheck } = triggerRegistry[item.source];
  const ref = item.sourceRef;
  if (ref.source === "thread_context")
    return ref.messageIds.map((messageId) => ({ messageId, invocationId: null }));
  if (recheck === "owner_source" && ref.source === "owner_message")
    return [{ messageId: ref.messageId, invocationId: null }];
  if (recheck === "caller_source" && ref.source === "caller_message")
    return [{ messageId: ref.messageId, invocationId: ref.invocationId }];
  return [];
}

/** What device/sources must check for these items. */
export function sourceRequest(items: InboxRow[]) {
  const sources = items.flatMap(sourceOf);
  return {
    messageIds: sources.map((source) => source.messageId),
    invocationIds: sources.flatMap((source) => source.invocationId ?? []),
  };
}

/**
 * Items whose source the server did not return: the owner cannot see the message now, or the
 * call may not run any more. Items without a source check always pass.
 */
export function inaccessibleItems(items: InboxRow[], sources: AgentSourcesResult) {
  const messages = new Set(sources.messages.map((message) => message.id));
  const revoked = new Set(sources.inaccessibleInvocations ?? []);
  return items.filter((item) => {
    const refs = sourceOf(item);
    return refs.some(
      (source) =>
        !messages.has(source.messageId) ||
        (source.invocationId !== null && revoked.has(source.invocationId)),
    );
  });
}
