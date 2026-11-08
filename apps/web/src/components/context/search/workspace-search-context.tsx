import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

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
}>({ openSearch: () => {} });

export function WorkspaceSearchProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<SearchRequest>();
  const value = useMemo(
    () => ({
      request,
      openSearch: (kind: SearchKind) =>
        setRequest((current) => ({ id: (current?.id ?? 0) + 1, kind })),
    }),
    [request],
  );
  return <WorkspaceSearchContext value={value}>{children}</WorkspaceSearchContext>;
}

export function useWorkspaceSearch() {
  return useContext(WorkspaceSearchContext);
}
