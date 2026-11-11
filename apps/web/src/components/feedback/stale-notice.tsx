import { Button } from "@/components/ui/button";
import { cn } from "cn";

export function StaleNotice({
  children,
  className,
  onRetry,
}: {
  children: React.ReactNode;
  className?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
      {onRetry && (
        <Button type="button" variant="link" size="xs" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
