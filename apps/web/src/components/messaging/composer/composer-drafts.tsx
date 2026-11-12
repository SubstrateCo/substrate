import { partialMatchKey, useQueryClient } from "@tanstack/react-query";

import { createContext, useEffect, useState, type ReactNode } from "react";

import { isAccessFailure } from "@/components/feedback/request-failure";
import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import { retainConversationDraft } from "@/lib/messaging/composer-draft-access";
import type { Conversation } from "@/lib/messaging/conversations";
import { queryKeys } from "@/queries/keys";

export const ComposerDrafts = createContext<{
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  clear: (key: string, expected: string) => void;
} | null>(null);
export const ComposerDraftReferences = createContext<Map<string, WorkspaceReference[]> | null>(
  null,
);
export const ComposerSendRequests = createContext<Map<string, { id: string; body: string }> | null>(
  null,
);

export function ComposerDraftProvider({
  organizationId,
  children,
}: {
  organizationId: string | null;
  children: ReactNode;
}) {
  const client = useQueryClient();
  const [drafts, setDrafts] = useState(() => new Map<string, string>());
  const [references] = useState(() => new Map<string, WorkspaceReference[]>());
  const [requests] = useState(() => new Map<string, { id: string; body: string }>());
  useEffect(() => {
    if (!organizationId) return;
    const listPrefix = queryKeys.conversations(organizationId);
    const discussions = new Set<string>();
    const rememberDiscussions = (rows: Conversation[]) => {
      for (const row of rows) if (row.task) discussions.add(row.id);
    };
    for (const [key, rows] of client.getQueriesData<Conversation[]>({ queryKey: listPrefix }))
      if ((key.length === listPrefix.length || key[listPrefix.length] === "selected") && rows)
        rememberDiscussions(rows);
    const organizationKey = JSON.stringify(queryKeys.organizationSummary(organizationId));
    // Only a confirmed read changes access. Cache resets and network failures must not
    // discard an unsent draft or the request ID of a send whose response was lost.
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
      const accessible = (draftKey: string) => {
        if (unavailable && key === organizationKey) return false;
        return retainConversationDraft(draftKey.split(":")[1]!, allowed, discussions, selectedId);
      };
      for (const draftKey of references.keys()) {
        if (!accessible(draftKey)) references.delete(draftKey);
      }
      for (const draftKey of requests.keys()) {
        if (!accessible(draftKey)) requests.delete(draftKey);
      }
      setDrafts((current) => {
        if ([...current.keys()].every(accessible)) return current;
        return new Map([...current].filter(([draftKey]) => accessible(draftKey)));
      });
    });
  }, [client, organizationId, references, requests]);
  return (
    <ComposerDrafts
      value={{
        get: (key) => drafts.get(key),
        set: (key, value) =>
          setDrafts((current) => {
            if (current.get(key) === value) return current;
            const next = new Map(current);
            next.set(key, value);
            return next;
          }),
        clear: (key, expected) =>
          setDrafts((current) => {
            if (current.get(key) !== expected) return current;
            const next = new Map(current);
            next.set(key, "");
            return next;
          }),
      }}
    >
      <ComposerDraftReferences value={references}>
        <ComposerSendRequests value={requests}>{children}</ComposerSendRequests>
      </ComposerDraftReferences>
    </ComposerDrafts>
  );
}
