import { createContext, useState, type ReactNode } from "react";

import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";

export const ComposerDrafts = createContext<Map<string, string> | null>(null);
export const ComposerDraftReferences = createContext<Map<string, WorkspaceReference[]> | null>(
  null,
);

export function ComposerDraftProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, string>());
  const [references] = useState(() => new Map<string, WorkspaceReference[]>());
  return (
    <ComposerDrafts value={drafts}>
      <ComposerDraftReferences value={references}>{children}</ComposerDraftReferences>
    </ComposerDrafts>
  );
}
