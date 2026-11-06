import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageWork } from "@/ui/messaging/message-work";
import { isAccessFailure } from "@/ui/feedback/request-failure";
import { messageLinksOptions } from "@/queries/context/options";
import { workHref } from "@/lib/context-links";
import { detachWork } from "@/api/context";
import { queryKeys } from "@/queries/keys";

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
      removeError={remove.error}
    />
  );
}
