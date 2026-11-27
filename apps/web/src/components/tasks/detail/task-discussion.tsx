import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { DiscussionPreview } from "@/components/messaging/messages/discussion-preview";
import { Button } from "@/components/ui/button";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { messageLink, type RecordLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { messagesQueryOptions } from "@/queries/messaging/options";
import { useTaskDiscussion } from "@/queries/tasks/mutations";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export function TaskDiscussion({
  projectEntityId,
  taskEntityId,
  visible,
  conversationId,
  archived = false,
}: {
  projectEntityId: string;
  taskEntityId: string;
  visible: boolean;
  conversationId: string | null;
  /** An archived task keeps its discussion but cannot start one. */
  archived?: boolean;
}) {
  const { organizationId } = useWorkspaceScope();
  const discussion = useTaskDiscussion();
  const navigate = useNavigate();
  const messages = useQuery({
    ...messagesQueryOptions(organizationId, conversationId),
    enabled: visible,
  });
  return (
    <DiscussionPreview
      messages={resourceState(messages).data ?? []}
      loading={!!conversationId && messages.isPending}
      error={messages.error}
      onRetry={() => void messages.refetch()}
      conversationLink={
        <TaskDiscussionLink
          link={conversationId ? messageLink(organizationId, conversationId) : undefined}
          archived={archived}
          pending={discussion.isPending}
          onStart={() =>
            discussion.mutate(
              { organizationId, projectEntityId, taskEntityId },
              {
                onSuccess: ({ conversationId }) =>
                  void navigate(messageLink(organizationId, conversationId)),
                onError: (error) =>
                  toast.error(
                    actionErrorMessage(error, "Couldn’t open this discussion. Try again."),
                  ),
              },
            )
          }
        />
      }
    />
  );
}

/**
 * Opens the task's conversation. A task without one starts it on the first click, unless the
 * task is archived.
 */
function TaskDiscussionLink({
  link,
  archived,
  pending,
  onStart,
}: {
  link?: RecordLink;
  archived: boolean;
  pending: boolean;
  onStart: () => void;
}) {
  if (link)
    return (
      <Button asChild variant="link" size="xs" className="-ml-2 w-fit">
        <Link {...link}>
          View full conversation
          <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
        </Link>
      </Button>
    );
  if (archived) return null;
  return (
    <Button
      role="link"
      variant="link"
      size="xs"
      className="-mx-2 w-fit"
      disabled={pending}
      onClick={onStart}
    >
      <MessageCircle aria-hidden="true" />
      <span className="underline">View full conversation</span>
      <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
    </Button>
  );
}
