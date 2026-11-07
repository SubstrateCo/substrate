import { useMutation, useQueryClient } from "@tanstack/react-query";

import { detachWork, type MessagePageContext } from "@/api/context/links";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { MessageWork } from "@/components/messaging/messages/message-work";
import { workHref } from "@/lib/navigation/record-links";
import { queryKeys } from "@/queries/keys";
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
    mutationFn: (entityId: string) => detachWork({ data: { organizationId, messageId, entityId } }),
    onError: (error) =>
      toast.error(
        actionErrorMessage(error, "Couldn’t remove this link. Check that you still have access."),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.organization(organizationId) }),
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
      onRemove={(entityId) => remove.mutate(entityId)}
      removing={remove.isPending}
    />
  );
}
