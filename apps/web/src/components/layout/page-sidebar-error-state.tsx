import { isAccessFailure } from "@/components/feedback/request-failure";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CircleAlert, RefreshCw } from "lucide-react";

// Error view for a PageSidebar. Render it in place of PageSidebarContent to center it
// in the free space, or inside PageSidebarContent to show it above stale items.
export function PageSidebarErrorState({
  title,
  error,
  description,
  onRetry,
}: {
  title: string;
  error?: Error | null;
  description?: string;
  onRetry?: () => void;
}) {
  const message =
    description ??
    (isAccessFailure(error)
      ? "Check that you still have access to this workspace."
      : "Check your connection and try again.");

  return (
    <div
      data-slot="page-sidebar-error-state"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <Empty role="alert" variant="pane">
        <EmptyHeader>
          <EmptyMedia variant="error">
            <CircleAlert aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            <h2>{title}</h2>
          </EmptyTitle>
          <EmptyDescription className="wrap-break-word">{message}</EmptyDescription>
        </EmptyHeader>
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
