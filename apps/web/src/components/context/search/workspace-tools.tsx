import { useLocation } from "@tanstack/react-router";

import { WorkspaceSearch } from "./workspace-search";
import { useWorkspaceSearch } from "./workspace-search-request";
import { WorkspaceTools as WorkspaceToolsView } from "@/components/context/search/workspace-tools-view";
import { DesktopTitleBarContent } from "@/components/desktop/desktop-title-bar-content";

export function WorkspaceTools({ organizationId }: { organizationId: string }) {
  // A new page or history entry closes search. A replace on the same page, such as the workspace
  // filling in the selected conversation, keeps it open.
  const locationKey = useLocation({
    select: (location) => `${location.pathname}#${location.state.__TSR_index}`,
  });
  const { request } = useWorkspaceSearch();
  return (
    <DesktopTitleBarContent>
      <WorkspaceToolsView
        locationKey={locationKey}
        openRequest={request?.id}
        renderSearch={(query, onClose) => (
          <WorkspaceSearch
            // A new request starts a fresh search with the requested filter.
            key={request?.id ?? 0}
            organizationId={organizationId}
            initialKind={request?.kind}
            query={query}
            onClose={onClose}
          />
        )}
      />
    </DesktopTitleBarContent>
  );
}
