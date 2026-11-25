import { ContentNotice } from "./content-notice";
import { Button } from "@/components/ui/button";
import { CircleAlert, RefreshCw } from "lucide-react";

/**
 * A failed load, placed like `ContentNotice`: the pane default, `compact` in a card or section,
 * and `inline` (one red line with a "Try again" link) in a sidebar list.
 */
export function ErrorState({
  title,
  description = "We couldn’t load this content. Please try again.",
  onRetry,
  compact = false,
  inline = false,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  compact?: boolean;
  inline?: boolean;
}) {
  let variant: "pane" | "compact" | "inline" = compact ? "compact" : "pane";
  if (inline) variant = "inline";
  return (
    <ContentNotice
      tone="error"
      icon={CircleAlert}
      variant={variant}
      title={title}
      description={description}
      action={
        onRetry &&
        (inline ? (
          // The margin cancels the padding, so the link lines up with the text when it wraps.
          <Button type="button" variant="link" size="xs" className="-mx-2" onClick={onRetry}>
            Try again
          </Button>
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
