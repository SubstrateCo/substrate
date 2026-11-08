import { createContext, useState, type ReactNode } from "react";

import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";

export const ComposerDrafts = createContext<{
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  clear: (key: string, expected: string) => void;
} | null>(null);
export const ComposerDraftReferences = createContext<Map<string, WorkspaceReference[]> | null>(
  null,
);

export function ComposerDraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState(() => new Map<string, string>());
  const [references] = useState(() => new Map<string, WorkspaceReference[]>());
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
      <ComposerDraftReferences value={references}>{children}</ComposerDraftReferences>
    </ComposerDrafts>
  );
}
