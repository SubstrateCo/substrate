import { useQueryClient } from "@tanstack/react-query";

import { useEffect, useState, type ReactNode } from "react";

import {
  ComposerDraftReferences,
  ComposerDrafts,
  ComposerSendRequests,
} from "./composer-draft-context";
import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import { subscribeDraftAccess } from "@/queries/messaging/draft-access";

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
    return subscribeDraftAccess(client, organizationId, (accessible) => {
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
