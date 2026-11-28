import { RetryLink } from "./retry-link";
import { cn } from "cn";

export function StaleNotice({
  title,
  description,
  onRetry,
  className,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn("flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground", className)}
    >
      <span>{title}</span>
      {onRetry && <RetryLink onRetry={onRetry} />}
      {description && <span className="basis-full">{description}</span>}
    </div>
  );
}
