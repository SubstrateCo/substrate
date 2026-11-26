import type { NotificationFilter } from "@substrate/contracts/context/notification-groups";

import { Fragment, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { PendingButton } from "../../feedback/pending-button";
import { NotificationItem, NotificationRowsLoading, type Notification } from "./notification-item";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { FilterBar, type FilterField, type FilterValue } from "@/components/filters";
import { PageHeader } from "@/components/layout/page-header";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDayLabel } from "@/lib/format/date";
import type { ResourceStatus } from "@/lib/resource-state";
import { Bell, CheckCheck, Eye, X } from "lucide-react";

type NotificationFilterFieldId = "read";

/** One "Read" field with one option. No clause means the whole feed. */
const filterFields: FilterField<NotificationFilterFieldId>[] = [
  {
    id: "read",
    label: "Read",
    icon: Eye,
    kind: "option",
    options: [{ value: "unread", label: "Unread" }],
  },
];

function notificationFilterValue(
  filter: NotificationFilter,
): FilterValue<NotificationFilterFieldId> {
  return filter === "unread" ? { read: { operator: "is", values: ["unread"] } } : {};
}

function notificationFilterFrom(value: FilterValue<NotificationFilterFieldId>): NotificationFilter {
  return value.read?.values.includes("unread") ? "unread" : "all";
}

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

/** Up and Down move between rows, like a list in Linear or Mail. Tab still visits every control. */
function moveBetweenRows(event: KeyboardEvent<HTMLUListElement>) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step || !(event.target instanceof HTMLElement) || event.target.tagName !== "A") return;
  const rows = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>("li > div a[href]")];
  const target = event.target;
  const current = rows.findIndex((row) => row === target);
  const next = current < 0 ? undefined : rows[current + step];
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.scrollIntoView({ block: "nearest" });
}

export function NotificationList({
  items,
  state,
  loading,
  error,
  filter,
  onFilter,
  paging,
  readingAll,
  onRetry,
  onRead,
  onReadAll,
  onOpen,
  onClose,
  renderEvents,
}: {
  items: Notification[];
  state: ResourceStatus;
  loading: boolean;
  error?: Error | null;
  filter: NotificationFilter;
  onFilter: (filter: NotificationFilter) => void;
  /** Older pages of the feed. */
  paging: { hasMore: boolean; loading: boolean; onMore: () => void };
  readingAll: boolean;
  onRetry: () => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onOpen: (item: Notification, event: MouseEvent<HTMLAnchorElement>) => void;
  onClose?: () => void;
  renderEvents: (item: Notification) => ReactNode;
}) {
  const failed = state === "error" || state === "unavailable";
  const empty = !failed && !loading && !items.length;
  const unread = items.some((item) => !item.read);
  return (
    <PageLayout id="notifications" aria-label="Notifications">
      <PageContent>
        <div
          role="region"
          aria-label="Notification feed"
          aria-busy={loading}
          className="min-h-0 flex-1 overflow-y-auto p-6"
        >
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6">
            <PageHeader
              title="Notifications"
              description="Mentions, replies, and tasks assigned to you."
              actions={
                <>
                  <PendingButton
                    size="sm"
                    variant="ghost"
                    pending={readingAll}
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
            <FilterBar
              aria-label="Notification filters"
              fields={filterFields}
              value={notificationFilterValue(filter)}
              onValueChange={(value) => onFilter(notificationFilterFrom(value))}
              // With nothing unread, the empty state offers its own "Show all".
              clearable={!empty}
            />
            <div className="flex flex-1 flex-col gap-4">
              <NotificationFeedNotice state={state} onRetry={onRetry} />
              {loading && !items.length && !failed && (
                <div className="-mx-3">
                  <NotificationRowsLoading label="Loading notifications" />
                </div>
              )}
              {empty && (
                <EmptyNotificationFeed
                  unreadOnly={filter === "unread"}
                  onShowAll={() => onFilter("all")}
                />
              )}
              {!failed && items.length > 0 && (
                <>
                  <ul
                    aria-label="Notification activity"
                    className="-mx-3 flex flex-col gap-px"
                    onKeyDown={moveBetweenRows}
                  >
                    {dayLabeled(items).map(({ item, label }) => (
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
                          renderEvents={() => renderEvents(item)}
                        />
                      </Fragment>
                    ))}
                  </ul>
                  {paging.hasMore && (
                    <PendingButton
                      variant="ghost"
                      size="sm"
                      className="self-center"
                      pending={paging.loading}
                      onClick={paging.onMore}
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

function NotificationFeedNotice({
  state,
  onRetry,
}: {
  state: ResourceStatus;
  onRetry: () => void;
}) {
  switch (state) {
    case "stale":
      return <StaleNotice onRetry={onRetry}>Notifications may be out of date.</StaleNotice>;
    case "unavailable":
      return (
        <ErrorState
          title="Notifications unavailable"
          description="Check that you still have access to this workspace."
        />
      );
    case "error":
      return <ErrorState title="Couldn’t load notifications" onRetry={onRetry} />;
    case "ready":
    case "loading":
      return null;
  }
}

function EmptyNotificationFeed({
  unreadOnly,
  onShowAll,
}: {
  unreadOnly: boolean;
  onShowAll: () => void;
}) {
  return (
    <ContentNotice
      icon={Bell}
      title={unreadOnly ? "You’re all caught up" : "No notifications yet"}
      description={
        unreadOnly
          ? "Nothing new since you last looked."
          : "Mentions, replies, and tasks assigned to you will show up here."
      }
      action={
        unreadOnly && (
          <Button variant="outline" size="sm" onClick={onShowAll}>
            Show all
          </Button>
        )
      }
    />
  );
}
