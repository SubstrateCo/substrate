import { useLocation } from "@tanstack/react-router";

import { WorkspaceSearch } from "./workspace-search";
import { WorkspaceTools as WorkspaceToolsView } from "@/components/context/search/workspace-tools-view";
import { DesktopTitleBarContent } from "@/components/desktop/desktop-title-bar-content";

export function WorkspaceTools({ organizationId }: { organizationId: string }) {
  const locationKey = useLocation({ select: (location) => location.href });
  return (
    <DesktopTitleBarContent>
      <WorkspaceToolsView
        locationKey={locationKey}
        renderSearch={(query, onQueryChange, focusInput) => (
          <WorkspaceSearch
            organizationId={organizationId}
            query={query}
            onQueryChange={onQueryChange}
            onFocusInput={focusInput}
          />
        )}
      />
    </DesktopTitleBarContent>
  );
}
