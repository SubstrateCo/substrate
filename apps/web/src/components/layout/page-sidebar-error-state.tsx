import { ErrorStateHeader } from "@/components/feedback/error-state-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent } from "@/components/ui/empty";
import { RefreshCw } from "lucide-react";

// Error view for a PageSidebar. Render it in place of PageSidebarContent to center it
// in the free space, or inside PageSidebarContent to show it above stale items.
export function PageSidebarErrorState({
  title,
  unavailable = false,
  description,
  onRetry,
}: {
  title: string;
  unavailable?: boolean;
  description?: string;
  onRetry?: () => void;
}) {
  const message =
    description ??
    (unavailable
      ? "Check that you still have access to this workspace."
      : "Check your connection and try again.");

  return (
    <div
      data-slot="page-sidebar-error-state"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <Empty role="alert" variant="pane">
        <ErrorStateHeader title={title} description={message} />
        {onRetry && (
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </EmptyContent>
        )}
      </Empty>
    </div>
  );
}
