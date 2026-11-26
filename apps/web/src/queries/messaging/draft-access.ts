import { partialMatchKey, type QueryClient } from "@tanstack/react-query";

import { isAccessFailure } from "@/api/access-failure";
import { retainConversationDraft } from "@/lib/messaging/composer-draft-access";
import type { Conversation } from "@/lib/messaging/conversations";
import { queryKeys } from "@/queries/keys";

/**
 * Calls `onRevoke` after each confirmed read that can change which composer drafts the viewer may
 * keep: a conversation list read, or an access failure on the organization summary. Its argument
 * tells whether a draft key (`organization:conversation:thread`) is still accessible. Cache resets
 * and network failures call nothing, so they never discard an unsent draft or the request ID of a
 * send whose response was lost. Returns the unsubscribe function.
 */
export function subscribeDraftAccess(
  client: QueryClient,
  organizationId: string,
  onRevoke: (accessible: (draftKey: string) => boolean) => void,
) {
  const listPrefix = queryKeys.conversations(organizationId);
  // The plain list omits task discussions, so remember the ones a selected read found.
  const discussions = new Set<string>();
  const rememberDiscussions = (rows: Conversation[]) => {
    for (const row of rows) if (row.task) discussions.add(row.id);
  };
  for (const [key, rows] of client.getQueriesData<Conversation[]>({ queryKey: listPrefix }))
    if ((key.length === listPrefix.length || key[listPrefix.length] === "selected") && rows)
      rememberDiscussions(rows);
  const organizationKey = JSON.stringify(queryKeys.organizationSummary(organizationId));
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const key = JSON.stringify(event.query.queryKey);
    const suffix = event.query.queryKey.slice(listPrefix.length);
    const list =
      partialMatchKey(event.query.queryKey, listPrefix) &&
      (suffix.length === 0 || (suffix.length === 2 && suffix[0] === "selected"));
    if (!list && key !== organizationKey) return;
    const unavailable = event.action.type === "error" && isAccessFailure(event.query.state.error);
    if (!unavailable && (!list || event.action.type !== "success")) return;
    const conversations = unavailable
      ? []
      : client.getQueryData<Conversation[]>(event.query.queryKey);
    if (!conversations) return;
    rememberDiscussions(conversations);
    const allowed = new Set(conversations.map((conversation) => conversation.id));
    // SAFETY: selected list keys come from queryKeys.conversationList with a string ID.
    const selectedId = list && suffix[0] === "selected" ? (suffix[1] as string) : undefined;
    onRevoke((draftKey) => {
      if (unavailable && key === organizationKey) return false;
      return retainConversationDraft(draftKey.split(":")[1]!, allowed, discussions, selectedId);
    });
  });
}
