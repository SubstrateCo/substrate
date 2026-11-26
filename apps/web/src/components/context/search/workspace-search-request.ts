import { createContext, useContext } from "react";

import type { SearchKind } from "./workspace-search-view";

// Lets workspace views open the search panel with a filter, such as "Browse channels".
// Each request has a new ID, so the same filter can be requested again.
export interface SearchRequest {
  id: number;
  kind: SearchKind;
}

export const WorkspaceSearchContext = createContext<{
  request?: SearchRequest;
  openSearch: (kind: SearchKind) => void;
  localSearchTarget: HTMLDivElement | null;
  setLocalSearchTarget: (target: HTMLDivElement | null) => void;
}>({ openSearch: () => {}, localSearchTarget: null, setLocalSearchTarget: () => {} });

export function useWorkspaceSearch() {
  return useContext(WorkspaceSearchContext);
}
