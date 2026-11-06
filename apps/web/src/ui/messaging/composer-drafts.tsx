import { createContext, useState, type ReactNode } from "react";

export const ComposerDrafts = createContext<Map<string, string> | null>(null);

export function ComposerDraftProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, string>());
  return <ComposerDrafts value={drafts}>{children}</ComposerDrafts>;
}
