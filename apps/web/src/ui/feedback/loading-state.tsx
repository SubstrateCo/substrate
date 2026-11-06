import { Skeleton } from "../primitives/skeleton";
import { cn } from "../lib/utils";

export function LoadingState({
  label,
  variant = "list",
  rows = 3,
}: {
  label: string;
  variant?: "list" | "compact" | "messages" | "table";
  rows?: number;
}) {
  return (
    <div role="status" aria-label={label} className="min-w-0">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className={cn("space-y-2", variant === "messages" && "space-y-5")}>
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center gap-3",
              variant === "list" && "px-3 py-3",
              variant === "compact" && "p-2",
              variant === "table" && "border-b px-3 py-4",
              variant === "messages" && "items-start",
            )}
          >
            {variant !== "table" && (
              <Skeleton className={cn("size-9 shrink-0", variant === "compact" && "size-7")} />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn("h-3", index % 2 === 0 ? "w-2/5" : "w-1/3")} />
              {variant !== "compact" && <Skeleton className="h-3 w-3/4" />}
              {variant === "messages" && <Skeleton className="h-3 w-1/2" />}
            </div>
            {(variant === "list" || variant === "table") && (
              <Skeleton className="h-7 w-16 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
