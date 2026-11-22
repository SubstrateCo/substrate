import type { CrmActivity } from "@substrate/contracts/crm/activity";

import { activityActionLabel, activityFieldLabel } from "./activity-labels";
import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Timestamp } from "@/components/time/timestamp";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { cn } from "cn";
import { History, Unlink } from "lucide-react";

export function ActivityList({
  items,
  loading,
  error,
  loadingMore,
  hasMore,
  onRetry,
  onLoadMore,
}: {
  items: CrmActivity[];
  loading: boolean;
  error: Error | null;
  loadingMore: boolean;
  hasMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  const unavailable = isAccessFailure(error);
  const showLoading = useDelayedLoading(loading && !items.length);
  return (
    <section aria-label="Activity" className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Activity</h2>
        <p className="text-xs text-muted-foreground">
          Internal record changes by people and agents. Customer interactions and discussions are
          shown separately.
        </p>
      </div>
      {loading && !items.length && (
        <div
          role="status"
          aria-label="Loading activity"
          className={cn(!showLoading && "invisible")}
        >
          <ol aria-hidden="true" className="divide-y">
            {[0, 1, 2].map((key) => (
              <ActivityRowLayout key={key}>
                <span className="size-6 shrink-0 overflow-hidden rounded-full">
                  <Skeleton className="size-full" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-medium">
                    <SkeletonText width="8rem" />
                  </div>
                  <p className="text-sm">
                    <SkeletonText width="14rem" />
                  </p>
                </div>
                <span className="shrink-0 text-xs">
                  <SkeletonText width="5rem" />
                </span>
              </ActivityRowLayout>
            ))}
          </ol>
        </div>
      )}
      {unavailable && (
        <ContentNotice
          icon={Unlink}
          title="Activity unavailable"
          description="You may no longer have access to this record’s activity."
        />
      )}
      {error && !unavailable && (
        <ErrorState
          compact
          title="Couldn’t load activity"
          description="Your record’s activity could not be refreshed. Try again."
          onRetry={onRetry}
        />
      )}
      {!loading && !error && !items.length && (
        <ContentNotice
          icon={History}
          title="No activity yet"
          description="Record changes appear here when people or agents update this customer record."
        />
      )}
      {!unavailable && items.length > 0 && (
        <ol className="divide-y">
          {items.map((item) => (
            <ActivityRowLayout key={item.id}>
              <PersonAvatar name={item.actor.displayName} agent={item.actor.type === "agent"} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium wrap-break-word">{item.actor.displayName}</span>
                  <Tag>{item.actor.type === "agent" ? "Agent" : "Person"}</Tag>
                </div>
                <p className="text-sm wrap-break-word text-muted-foreground">
                  {activityActionLabel[item.action]}
                  {item.changedFields.length > 0 && (
                    <>
                      {" "}
                      · {item.changedFields.map((field) => activityFieldLabel[field]).join(", ")}
                    </>
                  )}
                </p>
              </div>
              <Timestamp
                value={item.createdAt}
                format="datetime"
                className="shrink-0 text-xs text-muted-foreground"
              />
            </ActivityRowLayout>
          ))}
        </ol>
      )}
      {hasMore && !unavailable && (
        <PendingButton
          variant="outline"
          size="sm"
          pending={loadingMore}
          pendingLabel="Loading activity…"
          onClick={onLoadMore}
        >
          Load more activity
        </PendingButton>
      )}
    </section>
  );
}

function ActivityRowLayout({ children }: { children: React.ReactNode }) {
  return <li className="flex min-w-0 items-start gap-3 py-3">{children}</li>;
}
