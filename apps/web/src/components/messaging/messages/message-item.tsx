import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { CopyLink } from "../../context/links/copy-link";
import { LinkMessageWork } from "../../context/links/link-message-work";
import { MessageContext, type MessageContextState } from "../../context/references/message-context";
import { ReferencedMessageBody } from "../../context/references/referenced-message-body";
import { toggleReaction } from "@/api/messaging/requests";
import type { Message } from "@/api/messaging/requests";
import { AgentRunBadge, AgentRunSlot } from "@/components/agent-runs/agent-run-slot";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { LinkedMessage } from "@/components/messaging/messages/linked-message";
import { MessageItem as MessageItemView } from "@/components/messaging/messages/message-item-view";
import { MessageWorkActions } from "@/components/messaging/messages/message-work-actions";
import { PersonCardProvider } from "@/components/messaging/people/person-card-slot";
import { PersonHoverCard } from "@/components/messaging/people/person-hover-card";
import { messageHref } from "@/lib/navigation/record-links";
import { queryKeys } from "@/queries/keys";
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
  const queryClient = useQueryClient();
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
    mutationFn: async (emoji: string) =>
      toggleReaction({ data: { organizationId, messageId: message.id, emoji } }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages(organizationId, message.conversationId).slice(0, -1),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.messageTargets(organizationId, message.conversationId),
        }),
      ]),
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
              <MessageWorkActions onLink={() => setLinking(true)} />
            </>
          }
          avatarBadge={<AgentRunBadge messageId={message.id} />}
          onThread={onThread}
          onReact={(emoji) => reaction.mutate(emoji)}
          pending={reaction.isPending}
        >
          <MessageContext
            organizationId={organizationId}
            messageId={message.id}
            context={context}
          />
          <AgentRunSlot messageId={message.id} />
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
