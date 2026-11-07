import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { CopyLink } from "../../context/links/copy-link";
import { LinkMessageWork } from "../../context/links/link-message-work";
import { MessageContext } from "../../context/references/message-context";
import { ReferencedMessageBody } from "../../context/references/referenced-message-body";
import { CreateSourceTask } from "../../context/source-task/create-source-task";
import { toggleReaction } from "@/api/messaging/requests";
import type { Message } from "@/api/messaging/requests";
import { LinkedMessage } from "@/components/messaging/messages/linked-message";
import { MessageItem as MessageItemView } from "@/components/messaging/messages/message-item-view";
import { MessageWorkActions } from "@/components/messaging/messages/message-work-actions";
import { messageHref } from "@/lib/navigation/record-links";
import { queryKeys } from "@/queries/keys";

export function MessageItem({
  message,
  organizationId,
  onThread,
}: {
  message: Message;
  organizationId: string;
  onThread?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false });
  const highlighted = search.messageId === message.id;
  const [action, setAction] = useState<"create" | "link" | null>(null);
  const reaction = useMutation({
    mutationFn: async (emoji: string) =>
      toggleReaction({ data: { organizationId, messageId: message.id, emoji } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
  });
  return (
    <LinkedMessage highlighted={highlighted}>
      <MessageItemView
        message={message}
        body={
          <ReferencedMessageBody
            organizationId={organizationId}
            messageId={message.id}
            body={message.body}
          />
        }
        actions={
          <>
            <CopyLink
              label="Copy message link"
              href={messageHref(organizationId, message.conversationId, message.id)}
            />
            <MessageWorkActions
              onCreate={() => setAction("create")}
              onLink={() => setAction("link")}
            />
          </>
        }
        onThread={onThread}
        onReact={(emoji) => reaction.mutate(emoji)}
        pending={reaction.isPending}
        error={reaction.error}
      >
        <MessageContext organizationId={organizationId} messageId={message.id} />
        {action === "create" && (
          <CreateSourceTask
            organizationId={organizationId}
            messageId={message.id}
            body={message.body}
            onClose={() => setAction(null)}
          />
        )}
        {action === "link" && (
          <LinkMessageWork
            organizationId={organizationId}
            messageId={message.id}
            onClose={() => setAction(null)}
          />
        )}
      </MessageItemView>
    </LinkedMessage>
  );
}
