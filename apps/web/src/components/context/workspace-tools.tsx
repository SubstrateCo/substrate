import { WorkspaceSearch } from "./workspace-search";
import { WorkspaceTools as WorkspaceToolsView } from "@/ui/context/workspace-tools";

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
