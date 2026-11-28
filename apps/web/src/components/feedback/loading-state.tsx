import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { cva } from "class-variance-authority";
import { cn } from "cn";

const loadingListVariants = cva("", {
  variants: {
    variant: {
      list: "space-y-2",
      compact: "space-y-2",
      messages: "space-y-5",
      table: "space-y-2",
    },
  },
});

const loadingRowVariants = cva("flex gap-3", {
  variants: {
    variant: {
      list: "items-center px-3 py-3",
      compact: "items-center p-2",
      messages: "items-start",
      table: "items-center border-b px-3 py-4",
    },
  },
});

const loadingAvatarVariants = cva("shrink-0", {
  variants: {
    variant: {
      list: "size-9",
      compact: "size-7",
      messages: "size-9",
    },
  },
});

export function LoadingState({
  label,
  variant = "list",
  rows = 3,
}: {
  label: string;
  variant?: "list" | "compact" | "messages" | "table";
  rows?: number;
}) {
  const showLoading = useDelayedLoading(true);
  return (
    <div role="status" aria-label={label} className={cn("min-w-0", !showLoading && "invisible")}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className={loadingListVariants({ variant })}>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={loadingRowVariants({ variant })}>
            {variant !== "table" && <Skeleton className={loadingAvatarVariants({ variant })} />}
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
