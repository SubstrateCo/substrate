import { useState, type ReactNode } from "react";

import { createDrafts, Drafts, useRegisterDraft } from "./unsaved-drafts-context";

export function UnsavedDraftsProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(createDrafts);
  return <Drafts.Provider value={drafts}>{children}</Drafts.Provider>;
}

export function RegisterDraft({ name, dirty }: { name: string; dirty: boolean }) {
  useRegisterDraft(name, dirty);
  return null;
}
