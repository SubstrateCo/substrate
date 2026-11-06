import { WorkspaceTools as WorkspaceToolsView } from "@startup-os/ui/context/workspace-tools";
import { WorkspaceSearch } from "./workspace-search";

export function WorkspaceTools({ organizationId }: { organizationId: string }) {
  return (
    <WorkspaceToolsView
      renderSearch={(onClose, query, onQueryChange) => (
        <WorkspaceSearch
          organizationId={organizationId}
          onClose={onClose}
          query={query}
          onQueryChange={onQueryChange}
        />
      )}
    />
  );
}
