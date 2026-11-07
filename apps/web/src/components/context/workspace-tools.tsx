import { WorkspaceSearch } from "./workspace-search";
import { WorkspaceTools as WorkspaceToolsView } from "@/components/context/workspace-tools-view";

export function WorkspaceTools({ organizationId }: { organizationId: string }) {
  return (
    <WorkspaceToolsView
      renderSearch={(query, onQueryChange, focusInput) => (
        <WorkspaceSearch
          organizationId={organizationId}
          query={query}
          onQueryChange={onQueryChange}
          onFocusInput={focusInput}
        />
      )}
    />
  );
}
