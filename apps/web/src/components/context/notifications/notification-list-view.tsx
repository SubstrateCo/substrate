import { useState, type MouseEvent } from "react";

import { FormMessage } from "../../auth/form-message";
import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { NotificationItem, type Notification } from "./notification-item";
import { Bell, CheckCheck, X } from "lucide-react";

export function NotificationList({
  items,
  loading,
  error,
  pendingId,
  actionError,
  onRetry,
  onRead,
  onOpen,
  onClose,
}: {
  items: Notification[];
  loading: boolean;
  error?: Error | null;
  pendingId?: string;
  actionError?: Error | null;
  onRetry: () => void;
  onRead: (id: string) => void;
  onOpen: (item: Notification, event: MouseEvent<HTMLAnchorElement>) => void;
  onClose?: () => void;
}) {
  const visible = isAccessFailure(error) ? [] : items;
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const filtered = filter === "unread" ? visible.filter((item) => !item.read) : visible;
  const unread = visible.filter((item) => !item.read).length;
  return (
    <section aria-label="Notifications" className="min-h-0 flex-1 overflow-auto bg-surface">
      <div className="border-b bg-card py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              <Bell className="size-4" /> Your inbox
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Mentions and assignments that need your attention.
            </p>
          </div>
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
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
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
        {loading && !visible.length && (
          <LoadingState label="Loading notifications" variant="compact" />
        )}
        {error && <ErrorState compact title="Couldn't load notifications" onRetry={onRetry} />}
        {!loading && !error && !filtered.length && (
          <ContentNotice
            title={filter === "unread" ? "You’re all caught up" : "No notifications yet"}
            description="Mentions and task assignments will appear here."
          />
        )}
        <ul className="space-y-2">
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
        <FormMessage
          error={actionError}
          errorDescription="Couldn't update this notification. Try again."
        />
        {!loading && !error && visible.length > 0 && unread === 0 && (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <CheckCheck className="size-4" /> You’re all caught up
          </p>
        )}
      </div>
    </section>
  );
}
