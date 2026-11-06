import type { MouseEvent } from "react";
import { Button } from "../primitives/button";
import { LoadingState } from "../feedback/loading-state";
import { ErrorState } from "../feedback/error-state";
import { ContentNotice } from "../feedback/content-notice";
import { FormMessage } from "../auth/form-message";
import { isAccessFailure } from "../feedback/request-failure";
import { NotificationItem, type Notification } from "./notification-item";

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
  onClose: () => void;
}) {
  const visible = isAccessFailure(error) ? [] : items;
  return (
    <section
      aria-label="Notifications"
      className="max-h-96 space-y-3 overflow-auto border-b bg-card p-4"
    >
      <div className="flex justify-between">
        <h2 className="font-semibold">Notifications</h2>
        <Button variant="ghost" onClick={onClose}>
          Close notifications
        </Button>
      </div>
      {loading && !visible.length && (
        <LoadingState label="Loading notifications" variant="compact" />
      )}
      {error && <ErrorState compact title="Couldn't load notifications" onRetry={onRetry} />}
      {!loading && !error && !visible.length && (
        <ContentNotice
          title="No accessible notifications"
          description="New notifications will appear here."
        />
      )}
      <ul className="space-y-2">
        {visible.map((item) => (
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
    </section>
  );
}
