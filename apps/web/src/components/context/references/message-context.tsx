import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { detachWork } from "@/api/context/links";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { MessageWork } from "@/components/messaging/messages/message-work";
import { workHref } from "@/lib/navigation/record-links";
import { messageLinksOptions } from "@/queries/context/links";
import { queryKeys } from "@/queries/keys";
import { toast } from "sonner";

export function MessageContext({
  organizationId,
  messageId,
}: {
  organizationId: string;
  messageId: string;
}) {
  const links = useQuery(messageLinksOptions(organizationId, messageId));
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
      links={(isAccessFailure(links.error) ? [] : (links.data ?? [])).map((link) => ({
        ...link,
        href: workHref(
          organizationId,
          link.projectEntityId,
          link.entityType === "task" ? link.entityId : undefined,
        ),
      }))}
      loading={links.isPending}
      error={links.error}
      onRetry={() => void links.refetch()}
      onRemove={(entityId) => remove.mutate(entityId)}
      removing={remove.isPending}
    />
  );
}
