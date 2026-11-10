import type { MouseEvent } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { PendingButton } from "../../feedback/pending-button";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { NotificationItem, type Notification } from "./notification-item";
import { PageHeader } from "@/components/layout/page-header";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { Bell, CheckCheck, X } from "lucide-react";

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
            <Tabs
              value={filter}
              onValueChange={(value) => {
                if (value === "all" || value === "unread") onFilter(value);
              }}
            >
              <TabsList variant="line" aria-label="Notification filter">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread">Unread</TabsTrigger>
              </TabsList>
              <TabsContent value={filter}>
                <div className="flex flex-col gap-4 pt-2">
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
                        <ErrorState
                          compact
                          title="Couldn't refresh notifications"
                          onRetry={onRetry}
                        />
                      )}
                      <ul aria-label="Notification activity" className="-mx-3 flex flex-col gap-px">
                        {visible.map((item) => (
                          <NotificationItem
                            key={item.id}
                            item={item}
                            onRead={() => onRead(item.id)}
                            onOpen={(event) => onOpen(item, event)}
                          />
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
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </PageContent>
    </PageLayout>
  );
}
