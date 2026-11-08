import { useLocation } from "@tanstack/react-router";

import { WorkspaceSearch } from "./workspace-search";
import { useWorkspaceSearch } from "./workspace-search-context";
import { WorkspaceTools as WorkspaceToolsView } from "@/components/context/search/workspace-tools-view";
import { DesktopTitleBarContent } from "@/components/desktop/desktop-title-bar-content";

export function WorkspaceTools({ organizationId }: { organizationId: string }) {
  const locationKey = useLocation({ select: (location) => location.href });
  const { request } = useWorkspaceSearch();
  return (
    <DesktopTitleBarContent>
      <WorkspaceToolsView
        locationKey={locationKey}
        openRequest={request?.id}
        renderSearch={(query) => (
          <WorkspaceSearch
            // A new request starts a fresh search with the requested filter.
            key={request?.id ?? 0}
            organizationId={organizationId}
            initialKind={request?.kind}
            query={query}
          />
        )}
      />
    </DesktopTitleBarContent>
  );
}
