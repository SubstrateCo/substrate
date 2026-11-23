import { Button } from "../ui/button";
import { ContentNotice } from "./content-notice";
import { CircleAlert, RefreshCw } from "lucide-react";

export function ErrorState({
  title,
  description = "We couldn’t load this content. Please try again.",
  onRetry,
  compact = false,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <ContentNotice
      tone="error"
      icon={CircleAlert}
      variant={compact ? "compact" : "pane"}
      title={title}
      description={description}
      action={
        onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        )
      }
    />
  );
}
