import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { DiscussionPreview } from "@/components/messaging/messages/discussion-preview";
import { Button } from "@/components/ui/button";
import { messageLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { messagesQueryOptions } from "@/queries/messaging/options";
import { useTaskDiscussion } from "@/queries/tasks/mutations";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export function TaskDiscussion({
  organizationId,
  projectEntityId,
  taskEntityId,
  visible,
  conversationId,
  archived = false,
}: {
  organizationId: string;
  projectEntityId: string;
  taskEntityId: string;
  visible: boolean;
  conversationId: string | null;
  /** An archived task keeps its discussion but cannot start one. */
  archived?: boolean;
}) {
  const discussion = useTaskDiscussion();
  const navigate = useNavigate();
  const messages = useQuery({
    ...messagesQueryOptions(organizationId, conversationId ?? ""),
    enabled: visible && !!conversationId,
  });
  const openLink = (
    <Button
      role="link"
      variant="link"
      size="xs"
      className="-mx-2 w-fit"
      disabled={discussion.isPending}
      onClick={() =>
        discussion.mutate(
          { organizationId, projectEntityId, taskEntityId },
          {
            onSuccess: ({ conversationId }) =>
              void navigate(messageLink(organizationId, conversationId)),
            onError: (error) =>
              toast.error(actionErrorMessage(error, "Couldn’t open this discussion. Try again.")),
          },
        )
      }
    >
      <MessageCircle aria-hidden="true" />
      <span className="underline">View full conversation</span>
      <ArrowUpRight aria-hidden="true" />
    </Button>
  );
  return (
    <DiscussionPreview
      messages={conversationId ? (resourceState(messages).data ?? []) : []}
      loading={!!conversationId && messages.isPending}
      error={conversationId ? messages.error : null}
      onRetry={() => void messages.refetch()}
      conversationLink={
        conversationId ? (
          <Button asChild variant="link" size="xs" className="-ml-2 w-fit">
            <Link {...messageLink(organizationId, conversationId)}>
              View full conversation
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          !archived && openLink
        )
      }
    />
  );
}
