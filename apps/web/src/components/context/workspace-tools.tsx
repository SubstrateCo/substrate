import { useEffect, useState } from "react";
import { Button } from "@startup-os/ui/primitives/button";
import { WorkspaceSearch } from "./workspace-search";
import { NotificationList } from "./notification-list";

export function WorkspaceTools({ organizationId }: { organizationId: string }) {
  const [panel, setPanel] = useState<"search" | "notifications" | null>(null);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPanel("search");
      }
      if (event.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  return (
    <>
      <div aria-label="Workspace tools" role="toolbar" className="flex shrink-0 gap-2 border-b p-2">
        <Button
          size="sm"
          variant="outline"
          aria-expanded={panel === "search"}
          onClick={() => setPanel(panel === "search" ? null : "search")}
        >
          Search workspace
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-expanded={panel === "notifications"}
          onClick={() => setPanel(panel === "notifications" ? null : "notifications")}
        >
          Notifications
        </Button>
      </div>
      {panel === "search" && (
        <WorkspaceSearch organizationId={organizationId} onClose={() => setPanel(null)} />
      )}
      {panel === "notifications" && (
        <NotificationList organizationId={organizationId} onClose={() => setPanel(null)} />
      )}
    </>
  );
}
