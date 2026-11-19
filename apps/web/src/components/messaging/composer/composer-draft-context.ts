import { createContext } from "react";

import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";

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
