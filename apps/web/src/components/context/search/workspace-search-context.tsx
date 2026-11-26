import { useState, type ReactNode } from "react";

import { WorkspaceSearchContext, type SearchRequest } from "./workspace-search-request";
import type { SearchKind } from "./workspace-search-view";

export function WorkspaceSearchProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<SearchRequest>();
  const [localSearchTarget, setLocalSearchTarget] = useState<HTMLDivElement | null>(null);
  const value = {
    request,
    localSearchTarget,
    setLocalSearchTarget,
    openSearch: (kind: SearchKind) =>
      setRequest((current) => ({ id: (current?.id ?? 0) + 1, kind })),
  };
  return <WorkspaceSearchContext value={value}>{children}</WorkspaceSearchContext>;
}
