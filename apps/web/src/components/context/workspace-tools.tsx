import { WorkspaceTools as WorkspaceToolsView } from "@startup-os/ui/context/workspace-tools";
import { WorkspaceSearch } from "./workspace-search";
import { NotificationList } from "./notification-list";

export function WorkspaceTools({ organizationId }: { organizationId: string }) {
  return (
    <WorkspaceToolsView
      renderSearch={(onClose) => (
        <WorkspaceSearch organizationId={organizationId} onClose={onClose} />
      )}
      renderNotifications={(onClose) => (
        <NotificationList organizationId={organizationId} onClose={onClose} />
      )}
    />
  );
}
