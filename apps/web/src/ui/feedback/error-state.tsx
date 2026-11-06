import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "../primitives/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../primitives/empty";

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
  if (compact) {
    return (
      <div role="alert" className="flex flex-wrap items-start gap-3 py-2 text-foreground">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 text-sm/relaxed wrap-break-word text-muted-foreground">
            {description}
          </p>
        </div>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <Empty role="alert" variant="pane" className="min-h-48">
      <EmptyHeader>
        <EmptyMedia variant="error">
          <CircleAlert aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          <h2>{title}</h2>
        </EmptyTitle>
        <EmptyDescription className="wrap-break-word">{description}</EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button type="button" variant="outline" size="default" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
