import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@startup-os/ui/primitives/button";
import { LoadingState } from "@startup-os/ui/feedback/loading-state";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { FormMessage } from "@startup-os/ui/auth/form-message";
import { notificationsOptions } from "@/queries/context/options";
import { queryKeys } from "@/queries/keys";
import { markRead } from "@/api/context";
import { messageHref, workHref } from "@/lib/context-links";

export function NotificationList({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose: () => void;
}) {
  const items = useQuery(notificationsOptions(organizationId));
  const client = useQueryClient();
  const read = useMutation({
    mutationFn: (id: string) => markRead({ data: { organizationId, id } }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.context(organizationId) }),
  });
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
      {items.isPending && <LoadingState label="Loading notifications" variant="compact" />}
      {items.error && (
        <ErrorState
          compact
          title="Couldn’t load notifications"
          onRetry={() => void items.refetch()}
        />
      )}
      {!items.error && items.data?.length === 0 && <p>No accessible notifications.</p>}
      <ul className="space-y-2">
        {!items.error &&
          items.data?.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded border p-2 text-sm"
            >
              <a
                className="underline"
                onClick={(event) => {
                  event.preventDefault();
                  read.mutate(item.id, {
                    onSuccess: () => {
                      window.location.assign(
                        item.conversationId
                          ? messageHref(organizationId, item.conversationId, item.messageId!)
                          : workHref(organizationId, item.projectEntityId!, item.entityId!),
                      );
                    },
                  });
                }}
                href={
                  item.conversationId
                    ? messageHref(organizationId, item.conversationId, item.messageId!)
                    : workHref(organizationId, item.projectEntityId!, item.entityId!)
                }
              >
                {item.kind === "assignment" ? "Assigned to you: " : ""}
                {item.title}
              </a>
              <span>{item.readAt ? "Read" : "Unread"}</span>
              {!item.readAt && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={read.isPending}
                  onClick={() => read.mutate(item.id)}
                >
                  Mark as read
                </Button>
              )}
            </li>
          ))}
      </ul>
      <FormMessage
        error={read.error}
        errorDescription="Couldn’t update this notification. Try again."
      />
    </section>
  );
}
