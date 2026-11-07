import { useMutation, useQueryClient } from "@tanstack/react-query";

import { detachWork, type MessagePageContext } from "@/api/context/links";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { MessageWork } from "@/components/messaging/messages/message-work";
import { workHref } from "@/lib/navigation/record-links";
import { invalidateMessageWork } from "@/queries/context/mutations";
import { toast } from "sonner";

export type MessageContextState = {
  data?: MessagePageContext;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
};

export function MessageContext({
  organizationId,
  messageId,
  context,
}: {
  organizationId: string;
  messageId: string;
  context: MessageContextState;
}) {
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: ({ entityId }: { entityId: string; projectEntityId: string }) =>
      detachWork({ data: { organizationId, messageId, entityId } }),
    onError: (error) =>
      toast.error(
        actionErrorMessage(error, "Couldn’t remove this link. Check that you still have access."),
      ),
    onSuccess: (_, { entityId, projectEntityId }) =>
      invalidateMessageWork(client, organizationId, messageId, entityId, projectEntityId),
  });
  return (
    <MessageWork
      links={(isAccessFailure(context.error) ? [] : (context.data?.links ?? [])).map((link) => ({
        ...link,
        href: workHref(
          organizationId,
          link.projectEntityId,
          link.entityType === "task" ? link.entityId : undefined,
        ),
      }))}
      loading={context.loading}
      error={context.error}
      onRetry={context.onRetry}
      onRemove={(entityId) => {
        const work = context.data?.links.find((link) => link.entityId === entityId);
        if (work) remove.mutate({ entityId, projectEntityId: work.projectEntityId });
      }}
      removing={remove.isPending}
    />
  );
}
