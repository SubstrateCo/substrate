import { WorkspaceTools as WorkspaceToolsView } from "@/ui/context/workspace-tools";
import { WorkspaceSearch } from "./workspace-search";

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
