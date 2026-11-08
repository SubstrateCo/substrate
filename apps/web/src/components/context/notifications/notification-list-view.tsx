import { useState, type MouseEvent } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { PendingButton } from "../../feedback/pending-button";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { NotificationItem, type Notification } from "./notification-item";
import {
  PageContent,
  PageLayout,
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { Bell, BellDot, CheckCheck, Inbox, X } from "lucide-react";

export function NotificationList({
  items,
  loading,
  error,
  pendingId,
  onRetry,
  onRead,
  onReadAll,
  onOpen,
  onClose,
}: {
  items: Notification[];
  loading: boolean;
  error?: Error | null;
  pendingId?: string;
  onRetry: () => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onOpen: (item: Notification, event: MouseEvent<HTMLAnchorElement>) => void;
  onClose?: () => void;
}) {
  const visible = isAccessFailure(error) ? [] : items;
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const filtered = filter === "unread" ? visible.filter((item) => !item.read) : visible;
  const unread = visible.filter((item) => !item.read).length;
  const filters = [
    { value: "all", label: "All activity", icon: Inbox },
    { value: "unread", label: "Unread", icon: BellDot, count: unread },
  ] as const;
  const failed = !!error && !visible.length;
  const empty = !failed && !loading && !filtered.length;
  return (
    <PageLayout aria-label="Notifications">
      <PageSidebar aria-label="Notification filters">
        <PageSidebarHeader
          title="Notifications"
          actions={
            onClose && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Close notifications"
                    onClick={onClose}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close notifications</TooltipContent>
              </Tooltip>
            )
          }
        />
        <PageSidebarContent className="pt-0">
          <div
            role="group"
            aria-label="Notification filter"
            className="flex gap-0.5 overflow-x-auto md:flex-col"
          >
            {filters.map((item) => (
              <Button
                key={item.value}
                variant="sidebar"
                className="shrink-0 justify-start md:w-full"
                aria-current={filter === item.value ? "page" : undefined}
                onClick={() => setFilter(item.value)}
              >
                <item.icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{item.label}</span>
                {"count" in item && (
                  <span className="ml-auto rounded-full bg-muted px-2 text-xs">{item.count}</span>
                )}
              </Button>
            ))}
          </div>
        </PageSidebarContent>
      </PageSidebar>
      <PageContent className="overflow-y-auto">
        {failed && (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
            <ErrorState
              title={
                isAccessFailure(error) ? "Notifications unavailable" : "Couldn’t load notifications"
              }
              description={
                isAccessFailure(error)
                  ? "Check that you still have access to this workspace."
                  : undefined
              }
              onRetry={onRetry}
            />
          </div>
        )}
        {empty && (
          <Empty className="min-h-0 flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                <h2>{filter === "unread" ? "You’re all caught up" : "No notifications yet"}</h2>
              </EmptyTitle>
              <EmptyDescription>Mentions and task assignments will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!failed && !empty && (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {filter === "unread" ? "Unread" : "All activity"}
              </h2>
              <PendingButton
                size="sm"
                variant="ghost"
                pending={pendingId === "all"}
                pendingLabel="Marking all as read…"
                disabled={!!pendingId || unread === 0 || !!error}
                onClick={onReadAll}
              >
                <CheckCheck aria-hidden="true" />
                Mark all as read
              </PendingButton>
            </div>
            {loading && !visible.length && (
              <LoadingState label="Loading notifications" variant="compact" />
            )}
            {error && <ErrorState compact title="Couldn’t load notifications" onRetry={onRetry} />}
            <ul className="space-y-2 empty:hidden">
              {filtered.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  pending={pendingId === item.id}
                  disabled={!!pendingId}
                  onRead={() => {
                    if (!pendingId) onRead(item.id);
                  }}
                  onOpen={(event) => onOpen(item, event)}
                />
              ))}
            </ul>
            {!loading && !error && filtered.length > 0 && unread === 0 && (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <CheckCheck className="size-4" /> You’re all caught up
              </p>
            )}
          </div>
        )}
      </PageContent>
    </PageLayout>
  );
}
