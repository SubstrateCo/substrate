import { createContext, useContext, useState, type ReactNode } from "react";

import type { SearchKind } from "./workspace-search-view";

// Lets workspace views open the search panel with a filter, such as "Browse channels".
// Each request has a new ID, so the same filter can be requested again.
export interface SearchRequest {
  id: number;
  kind: SearchKind;
}

const WorkspaceSearchContext = createContext<{
  request?: SearchRequest;
  openSearch: (kind: SearchKind) => void;
  localSearchTarget: HTMLDivElement | null;
  setLocalSearchTarget: (target: HTMLDivElement | null) => void;
}>({ openSearch: () => {}, localSearchTarget: null, setLocalSearchTarget: () => {} });

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

export function useWorkspaceSearch() {
  return useContext(WorkspaceSearchContext);
}
