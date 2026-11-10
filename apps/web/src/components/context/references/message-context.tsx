import { useMutation, useQueryClient } from "@tanstack/react-query";

import { detachWork, type MessagePageContext } from "@/api/context/links";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { attachedWork } from "@/components/messaging/messages/attached-work";
import { MessageWork } from "@/components/messaging/messages/message-work";
import { linkedWorkHref } from "@/lib/navigation/record-links";
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
  const links = attachedWork(isAccessFailure(context.error) ? [] : (context.data?.links ?? []));
  // Most messages have no linked work. They mount no card and no mutation.
  if (!links.length && (!context.error || isAccessFailure(context.error))) return null;
  return (
    <MessageContextCard
      organizationId={organizationId}
      messageId={messageId}
      context={context}
      links={links}
    />
  );
}

function MessageContextCard({
  organizationId,
  messageId,
  context,
  links,
}: {
  organizationId: string;
  messageId: string;
  context: MessageContextState;
  links: MessagePageContext["links"];
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
      links={links.map((link) => ({ ...link, href: linkedWorkHref(organizationId, link) }))}
      error={context.error}
      onRetry={context.onRetry}
      onRemove={(entityId) => {
        const work = links.find((link) => link.entityId === entityId);
        if (work) remove.mutate({ entityId, projectEntityId: work.projectEntityId });
      }}
      removing={remove.isPending}
    />
  );
}
