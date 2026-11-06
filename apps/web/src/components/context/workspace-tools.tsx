import { WorkspaceSearch } from "./workspace-search";
import { WorkspaceTools as WorkspaceToolsView } from "@/ui/context/workspace-tools";

export function WorkspaceTools({ organizationId }: { organizationId: string }) {
  return (
    <WorkspaceToolsView
      renderSearch={(onClose, query, onQueryChange, focusInput) => (
        <WorkspaceSearch
          organizationId={organizationId}
          onClose={onClose}
          query={query}
          onQueryChange={onQueryChange}
          onFocusInput={focusInput}
        />
      )}
    />
  );
}
