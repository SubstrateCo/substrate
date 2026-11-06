import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../primitives/button";

export function WorkspaceTools({
  renderSearch,
  renderNotifications,
}: {
  renderSearch: (onClose: () => void) => ReactNode;
  renderNotifications: (onClose: () => void) => ReactNode;
}) {
  const [panel, setPanel] = useState<"search" | "notifications" | null>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const notificationsTrigger = useRef<HTMLButtonElement>(null);
  const [closedPanel, setClosedPanel] = useState<{ name: typeof panel }>();
  const closePanel = useCallback(() => {
    setPanel(null);
    if (panel) setClosedPanel({ name: panel });
  }, [panel]);
  useEffect(() => {
    if (closedPanel?.name === "search") searchTrigger.current?.focus();
    if (closedPanel?.name === "notifications") notificationsTrigger.current?.focus();
  }, [closedPanel]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPanel("search");
      }
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [closePanel]);
  return (
    <>
      <div
        aria-label="Workspace tools"
        role="toolbar"
        className="flex shrink-0 flex-wrap gap-2 border-b p-2"
      >
        <Button
          ref={searchTrigger}
          size="sm"
          variant="outline"
          aria-expanded={panel === "search"}
          onClick={() => setPanel(panel === "search" ? null : "search")}
        >
          Search workspace
        </Button>
        <Button
          ref={notificationsTrigger}
          size="sm"
          variant="outline"
          aria-expanded={panel === "notifications"}
          onClick={() => setPanel(panel === "notifications" ? null : "notifications")}
        >
          Notifications
        </Button>
      </div>
      {panel === "search" && renderSearch(closePanel)}
      {panel === "notifications" && renderNotifications(closePanel)}
    </>
  );
}
