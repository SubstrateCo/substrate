import { Fragment, type MouseEvent } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { PendingButton } from "../../feedback/pending-button";
import { isAccessFailure } from "../../feedback/request-failure";
import { SegmentedControl } from "../../forms/segmented-control";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { NotificationItem, type Notification } from "./notification-item";
import { PageHeader } from "@/components/layout/page-header";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { formatDayLabel } from "@/lib/format/date";
import { Bell, CheckCheck, X } from "lucide-react";

const filterOptions = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
] as const;

/** Newest first, so each run of rows from one day gets one label. */
function dayLabeled(items: Notification[]) {
  let previous = "";
  return items.map((item) => {
    const day = formatDayLabel(item.createdAt);
    const label = day === previous ? null : day;
    previous = day;
    return { item, label };
  });
}

export function NotificationList({
  items,
  loading,
  error,
  filter,
  onFilter,
  hasMore,
  loadingMore,
  onMore,
  readingAll,
  onRetry,
  onRead,
  onReadAll,
  onOpen,
  onClose,
}: {
  items: Notification[];
  loading: boolean;
  error?: Error | null;
  filter: "all" | "unread";
  onFilter: (filter: "all" | "unread") => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  readingAll: boolean;
  onRetry: () => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onOpen: (item: Notification, event: MouseEvent<HTMLAnchorElement>) => void;
  onClose?: () => void;
}) {
  const visible = isAccessFailure(error) ? [] : items;
  const failed = !!error && !visible.length;
  const empty = !failed && !loading && !visible.length;
  const unread = visible.some((item) => !item.read);
  return (
    <PageLayout id="notifications" aria-label="Notifications">
      <PageContent>
        <div
          role="region"
          aria-label="Notification feed"
          aria-busy={loading}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
            <PageHeader
              title="Notifications"
              description="Mentions, replies, and tasks assigned to you."
              actions={
                <>
                  <PendingButton
                    size="sm"
                    variant="ghost"
                    pending={readingAll}
                    pendingLabel="Marking all as read."
                    disabled={loading || !!error || !unread}
                    onClick={onReadAll}
                  >
                    <CheckCheck aria-hidden="true" /> Mark all as read
                  </PendingButton>
                  {onClose && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Close notifications"
                          onClick={onClose}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Close notifications</TooltipContent>
                    </Tooltip>
                  )}
                </>
              }
            />
            <SegmentedControl
              aria-label="Notification filter"
              value={filter}
              options={filterOptions}
              onValueChange={onFilter}
            />
            <div className="flex flex-col gap-4">
              {failed && (
                <ErrorState
                  title={
                    isAccessFailure(error)
                      ? "Notifications unavailable"
                      : "Couldn't load notifications"
                  }
                  description={
                    isAccessFailure(error)
                      ? "Check that you still have access to this workspace."
                      : undefined
                  }
                  onRetry={isAccessFailure(error) ? undefined : onRetry}
                />
              )}
              {loading && <LoadingState label="Loading notifications" variant="compact" />}
              {empty && (
                <ContentNotice
                  icon={Bell}
                  title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
                  description={
                    filter === "unread"
                      ? "Nothing new since you last looked."
                      : "Mentions, replies, and tasks assigned to you will show up here."
                  }
                  action={
                    filter === "unread" && (
                      <Button variant="outline" size="sm" onClick={() => onFilter("all")}>
                        Show all
                      </Button>
                    )
                  }
                />
              )}
              {!failed && visible.length > 0 && (
                <>
                  {error && (
                    <ErrorState compact title="Couldn't refresh notifications" onRetry={onRetry} />
                  )}
                  <ul aria-label="Notification activity" className="-mx-3 flex flex-col gap-px">
                    {dayLabeled(visible).map(({ item, label }) => (
                      <Fragment key={item.id}>
                        {label && (
                          <li
                            role="presentation"
                            className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground first:pt-0"
                          >
                            {label}
                          </li>
                        )}
                        <NotificationItem
                          item={item}
                          onRead={() => onRead(item.id)}
                          onOpen={(event) => onOpen(item, event)}
                        />
                      </Fragment>
                    ))}
                  </ul>
                  {hasMore && (
                    <PendingButton
                      variant="ghost"
                      size="sm"
                      className="self-center"
                      pending={loadingMore}
                      pendingLabel="Loading older notifications."
                      onClick={onMore}
                    >
                      Show older
                    </PendingButton>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </PageContent>
    </PageLayout>
  );
}
