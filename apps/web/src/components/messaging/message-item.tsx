import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { CopyLink } from "../context/copy-link";
import { CreateSourceTask } from "../context/create-source-task";
import { LinkMessageWork } from "../context/link-message-work";
import { MessageContext } from "../context/message-context";
import { ReferencedMessageBody } from "../context/referenced-message-body";
import { toggleReaction } from "@/api/messaging";
import { LinkedMessage } from "@/components/messaging/linked-message";
import { MessageItem as MessageItemView } from "@/components/messaging/message-item-view";
import { MessageWorkActions } from "@/components/messaging/message-work-actions";
import { messageHref } from "@/lib/context-links";
import type { Message } from "@/lib/messaging";
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
