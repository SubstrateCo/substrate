import { useState, type MouseEvent } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { PendingButton } from "../../feedback/pending-button";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { NotificationItem, type Notification } from "./notification-item";
import { CheckCheck, X } from "lucide-react";

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
  return (
    <section
      aria-label="Notifications"
      className="flex min-h-0 flex-1 flex-col overflow-auto bg-surface"
    >
      <div className="shrink-0 border-b bg-card">
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between gap-3 px-4">
          <h1 className="text-sm font-semibold">Notifications</h1>
          {onClose && (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Close notifications"
              title="Close notifications"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Notification filter" className="flex items-center gap-2">
            <Button
              size="sm"
              variant={filter === "all" ? "secondary" : "ghost"}
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All activity
            </Button>
            <Button
              size="sm"
              variant={filter === "unread" ? "secondary" : "ghost"}
              aria-pressed={filter === "unread"}
              onClick={() => setFilter("unread")}
            >
              Unread <span className="rounded-full bg-muted px-2 text-xs">{unread}</span>
            </Button>
          </div>
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
        {error && <ErrorState compact title="Couldn't load notifications" onRetry={onRetry} />}
        {!loading && !error && !filtered.length && (
          <div className="flex flex-1 items-center justify-center">
            <ContentNotice
              title={filter === "unread" ? "You’re all caught up" : "No notifications yet"}
              description="Mentions and task assignments will appear here."
            />
          </div>
        )}
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
    </section>
  );
}
