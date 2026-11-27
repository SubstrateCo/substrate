import { useState, type ReactNode } from "react";

import { createDrafts, Drafts } from "./unsaved-drafts-context";

export function UnsavedDraftsProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(createDrafts);
  return <Drafts.Provider value={drafts}>{children}</Drafts.Provider>;
}
