import { useMutation } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { CopyLink } from "../../context/links/copy-link";
import { LinkMessageWork } from "../../context/links/link-message-work";
import { MessageContext, type MessageContextState } from "../../context/references/message-context";
import { ReferencedMessageBody } from "../../context/references/referenced-message-body";
import { toggleReaction } from "@/api/messaging/requests";
import type { Message } from "@/api/messaging/requests";
import {
  AgentWorkBadge,
  AgentWorkSlot,
  AgentWorkStatus,
} from "@/components/agent-work/agent-work-slot";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { LinkedMessage } from "@/components/messaging/messages/linked-message";
import { MessageItem as MessageItemView } from "@/components/messaging/messages/message-item-view";
import { PersonCardProvider } from "@/components/messaging/people/person-card-slot";
import { PersonHoverCard } from "@/components/messaging/people/person-hover-card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { messageHref } from "@/lib/navigation/record-links";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

export function MessageItem({
  message,
  organizationId,
  onThread,
  context,
}: {
  message: Message;
  organizationId: string;
  onThread?: (id: string) => void;
  context: MessageContextState;
}) {
  const highlighted = useSearch({
    strict: false,
    select: (search) => search.messageId === message.id,
  });
  const [linking, setLinking] = useState(false);
  const reaction = useMutation({
    onError: (error) =>
      toast.error(
        actionErrorMessage(error, "Your reaction couldn’t be saved. Try selecting it again."),
      ),
    // The server sends the conversation a messaging hint, which reaches the reactor too. That
    // hint refreshes this conversation's history and message targets, so success needs no refetch.
    mutationFn: async (emoji: string) =>
      toggleReaction({ data: { organizationId, messageId: message.id, emoji } }),
  });
  return (
    <LinkedMessage highlighted={highlighted}>
      <PersonCardProvider
        render={(actorId, name, trigger) => (
          <PersonHoverCard
            organizationId={organizationId}
            conversationId={message.conversationId}
            actorId={actorId}
            name={name}
          >
            {trigger}
          </PersonHoverCard>
        )}
      >
        <MessageItemView
          message={message}
          body={
            <ReferencedMessageBody
              organizationId={organizationId}
              conversationId={message.conversationId}
              context={context}
              body={message.body}
            />
          }
          actions={
            <>
              <CopyLink
                label="Copy message link"
                href={messageHref(organizationId, message.conversationId, message.id)}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Link existing work"
                    onClick={() => setLinking(true)}
                  >
                    <Link2 aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Link existing work</TooltipContent>
              </Tooltip>
            </>
          }
          avatarBadge={<AgentWorkBadge messageId={message.id} />}
          status={
            message.authorType === "agent" ? <AgentWorkStatus messageId={message.id} /> : undefined
          }
          onThread={onThread}
          onReact={(emoji) => reaction.mutate(emoji)}
          pending={reaction.isPending}
        >
          <MessageContext
            organizationId={organizationId}
            messageId={message.id}
            context={context}
          />
          <AgentWorkSlot messageId={message.id} fromAgent={message.authorType === "agent"} />
          {linking && (
            <LinkMessageWork
              organizationId={organizationId}
              messageId={message.id}
              linkedIds={context.data?.links.map((link) => link.entityId) ?? []}
              onClose={() => setLinking(false)}
            />
          )}
        </MessageItemView>
      </PersonCardProvider>
    </LinkedMessage>
  );
}
