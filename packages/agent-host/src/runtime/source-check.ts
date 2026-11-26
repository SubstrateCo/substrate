import { triggerRegistry, type AgentSourcesResult } from "@substrate/contracts/agent-work";
import type { HostItem } from "@substrate/contracts/agent-work/control";

/** The messages that an item's source check reads. */
function sourceOf(item: HostItem): string[] {
  const { recheck } = triggerRegistry[item.source];
  const ref = item.sourceRef;
  if (ref.source === "thread_context") return ref.messageIds;
  if (recheck === "owner_source" && ref.source === "owner_message") return [ref.messageId];
  return [];
}

/** The message IDs that device/sources must check for these items. */
export function sourceRequest(items: HostItem[]) {
  return items.flatMap(sourceOf);
}

/**
 * Items whose source the server did not return: the owner cannot see the message now. Items
 * without a source check always pass.
 */
export function inaccessibleItems(items: HostItem[], sources: AgentSourcesResult) {
  const messages = new Set(sources.messages.map((message) => message.id));
  return items.filter((item) => sourceOf(item).some((messageId) => !messages.has(messageId)));
}
