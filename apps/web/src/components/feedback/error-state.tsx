import { ContentNotice } from "./content-notice";
import { RetryLink } from "./retry-link";
import { Button } from "@/components/ui/button";
import { CircleAlert, RefreshCw } from "lucide-react";

export function ErrorState({
  title,
  description = "We couldn’t load this content. Please try again.",
  onRetry,
  variant = "pane",
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  variant?: "pane" | "compact" | "inline";
}) {
  return (
    <ContentNotice
      tone="error"
      icon={CircleAlert}
      variant={variant}
      title={title}
      description={description}
      action={
        onRetry &&
        (variant === "inline" ? (
          <RetryLink onRetry={onRetry} />
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        ))
      }
    />
  );
}
