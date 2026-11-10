import { useEffect, useRef, type MouseEvent } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { PendingButton } from "../../feedback/pending-button";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../ui/empty";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../ui/tabs";
import { NotificationItem, type Notification } from "./notification-item";
import { fittingPageSize } from "./notification-page";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { Bell, CheckCheck, ChevronLeft, ChevronRight, X } from "lucide-react";

export function NotificationList({
  items,
  loading,
  error,
  pendingId,
  filter,
  onFilter,
  page,
  onPageSizeChange,
  hasNext,
  onPrevious,
  onNext,
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
  filter: "all" | "unread";
  onFilter: (filter: "all" | "unread") => void;
  page: number;
  onPageSizeChange: (size: number) => void;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRetry: () => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onOpen: (item: Notification, event: MouseEvent<HTMLAnchorElement>) => void;
  onClose?: () => void;
}) {
  const visible = isAccessFailure(error) ? [] : items;
  const failed = !!error && !visible.length;
  const empty = !failed && !loading && !visible.length;
  let emptyTitle = "No notifications yet";
  if (filter === "unread") emptyTitle = "You’re all caught up";
  if (page > 1) emptyTitle = "No more notifications";
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      onPageSizeChange(
        fittingPageSize({
          height: element.clientHeight,
          paddingTop: parseFloat(style.paddingTop),
          paddingBottom: parseFloat(style.paddingBottom),
          fontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
        }),
      );
    };
    // Measure at once so the first page can load; wait for resizing to settle after that.
    measure();
    let timeout: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(measure, 150);
    });
    observer.observe(element);
    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [onPageSizeChange]);

  return (
    <PageLayout id="notifications" aria-label="Notifications">
      <Tabs
        value={filter}
        onValueChange={(value) => {
          if (value === "all" || value === "unread") onFilter(value);
        }}
        asChild
      >
        <PageContent>
          <header className="shrink-0 space-y-5 px-4 pt-5 sm:px-6 sm:pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
                <p className="text-sm text-muted-foreground">
                  Your mentions, replies, and task assignments.
                </p>
              </div>
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close notifications"
                  onClick={onClose}
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <TabsList variant="line" aria-label="Notification filter">
                {(
                  [
                    ["all", "All activity"],
                    ["unread", "Unread"],
                  ] as const
                ).map(([value, label]) => (
                  <TabsTrigger key={value} value={value}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <PendingButton
                size="sm"
                variant="outline"
                pending={pendingId === "all"}
                pendingLabel="Marking all as read…"
                disabled={!!pendingId || loading || !!error || !visible.some((item) => !item.read)}
                onClick={onReadAll}
              >
                <CheckCheck aria-hidden="true" /> Mark all as read
              </PendingButton>
            </div>
          </header>
          <TabsContent value={filter} className="flex min-h-0 flex-1 flex-col">
            <div
              ref={scroll}
              role="region"
              aria-label="Notification feed"
              tabIndex={0}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6"
              aria-busy={loading}
            >
              {failed && (
                <ErrorState
                  title={
                    isAccessFailure(error)
                      ? "Notifications unavailable"
                      : "Couldn’t load notifications"
                  }
                  description={
                    isAccessFailure(error)
                      ? "Check that you still have access to this workspace."
                      : undefined
                  }
                  onRetry={onRetry}
                />
              )}
              {loading && <LoadingState label="Loading notifications" variant="compact" />}
              {empty && (
                <Empty className="min-h-0 flex-1">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Bell aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>
                      <h2>{emptyTitle}</h2>
                    </EmptyTitle>
                    <EmptyDescription>
                      {filter === "unread"
                        ? "Nothing needs your attention. You can find past updates in All activity."
                        : "Mentions, replies, and task assignments will appear here."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {filter === "unread" && (
                    <Button variant="outline" size="sm" onClick={() => onFilter("all")}>
                      View all activity
                    </Button>
                  )}
                </Empty>
              )}
              {!failed && visible.length > 0 && (
                <div className="shrink-0 overflow-hidden rounded-xl border bg-card shadow-xs">
                  {error && (
                    <ErrorState compact title="Couldn’t refresh notifications" onRetry={onRetry} />
                  )}
                  <ul aria-label="Notification activity" className="divide-y">
                    {visible.map((item) => (
                      <NotificationItem
                        key={item.id}
                        item={item}
                        pending={pendingId === item.id}
                        disabled={!!pendingId}
                        showUnread={filter !== "unread"}
                        onRead={() => {
                          if (!pendingId) onRead(item.id);
                        }}
                        onOpen={(event) => onOpen(item, event)}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TabsContent>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-6">
            <p
              role="status"
              aria-label="Notification page"
              className="text-xs text-muted-foreground"
            >
              Page {page}
              {!loading && !error && visible.length > 0 ? ` · ${visible.length} notifications` : ""}
            </p>
            <nav aria-label="Notification pagination" className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1 || loading || !!pendingId}
                onClick={onPrevious}
              >
                <ChevronLeft aria-hidden="true" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext || loading || !!error || !!pendingId}
                onClick={onNext}
              >
                Next <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          </footer>
        </PageContent>
      </Tabs>
    </PageLayout>
  );
}
