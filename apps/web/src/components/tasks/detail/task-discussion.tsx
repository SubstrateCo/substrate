import { useNavigate } from "@tanstack/react-router";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { Button } from "@/components/ui/button";
import { messageLink } from "@/lib/navigation/record-links";
import { useTaskDiscussion } from "@/queries/tasks/mutations";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export function TaskDiscussion({
  organizationId,
  projectEntityId,
  taskEntityId,
}: {
  organizationId: string;
  projectEntityId: string;
  taskEntityId: string;
}) {
  const discussion = useTaskDiscussion();
  const navigate = useNavigate();
  return (
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
      <span className="underline">Discussion</span>
      <ArrowUpRight aria-hidden="true" />
    </Button>
  );
}
