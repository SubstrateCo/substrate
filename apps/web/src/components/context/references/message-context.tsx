import { isAccessFailure } from "@/api/access-failure";
import type { MessagePageContext } from "@/api/context/links";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { attachedWork } from "@/components/messaging/messages/attached-work";
import { MessageWork } from "@/components/messaging/messages/message-work";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { linkedWorkLink } from "@/lib/navigation/record-links";
import { useDetachMessageWork } from "@/queries/context/link-mutations";
import { toast } from "sonner";

export type MessageContextState = {
  data?: MessagePageContext;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
};

export function MessageContext({
  messageId,
  context,
}: {
  messageId: string;
  context: MessageContextState;
}) {
  const links = attachedWork(isAccessFailure(context.error) ? [] : (context.data?.links ?? []));
  // Most messages have no linked work. They mount no card and no mutation.
  if (!links.length && (!context.error || isAccessFailure(context.error))) return null;
  return <MessageContextCard messageId={messageId} context={context} links={links} />;
}

function MessageContextCard({
  messageId,
  context,
  links,
}: {
  messageId: string;
  context: MessageContextState;
  links: MessagePageContext["links"];
}) {
  const { organizationId } = useWorkspaceScope();
  const remove = useDetachMessageWork(organizationId, messageId);
  const apps = useOrganizationApps();
  return (
    <MessageWork
      links={links.map((link) =>
        apps.entityEnabled(link.entityType)
          ? { ...link, link: linkedWorkLink(organizationId, link, apps.enabled("crm")) }
          : {
              ...link,
              title: "Unavailable record",
              status: null,
              statusName: null,
              purpose: "reference",
              canRemove: false,
              unavailable: true,
              link: linkedWorkLink(organizationId, link, apps.enabled("crm")),
            },
      )}
      error={context.error}
      onRetry={context.onRetry}
      onRemove={(entityId) => {
        const work = links.find((link) => link.entityId === entityId);
        if (work && apps.entityEnabled(work.entityType))
          remove.mutate(
            { entityId, projectEntityId: work.projectEntityId },
            {
              onError: (error) =>
                toast.error(
                  actionErrorMessage(
                    error,
                    "Couldn’t remove this link. Check that you still have access.",
                  ),
                ),
            },
          );
      }}
      removing={remove.isPending}
    />
  );
}
