import { SkeletonText } from "@/components/feedback/skeleton-text";
import { MessageRowLayout } from "@/components/messaging/messages/message-row-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { cn } from "cn";

export function MessageLoading({ label }: { label: string }) {
  const showLoading = useDelayedLoading(true);
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("relative flex min-h-0 flex-1 flex-col", !showLoading && "invisible")}
    >
      <div aria-hidden="true" className="min-h-0 flex-1 overflow-hidden pt-4 pb-3">
        {[0, 1, 2, 3].map((index) => (
          <MessageRowLayout
            key={index}
            avatar={
              <div className="relative mt-0.5 size-9 shrink-0 overflow-hidden rounded-full">
                <Skeleton className="size-full" />
              </div>
            }
            byline={
              <>
                <span className="text-sm font-semibold">
                  <SkeletonText width="7rem" />
                </span>
                <span className="text-xs">
                  <SkeletonText width="3rem" />
                </span>
              </>
            }
          >
            <div className="text-sm">
              <SkeletonText width={index % 2 ? "14rem" : "22rem"} />
            </div>
          </MessageRowLayout>
        ))}
      </div>
    </div>
  );
}
