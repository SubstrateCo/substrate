import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageItem as MessageItemView } from "@startup-os/ui/messaging/message-item";
import type { Message } from "@/lib/messaging";
import { queryKeys } from "@/queries/keys";
import { toggleReaction } from "@/server/messaging";
import { useEffect, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { Button } from "@startup-os/ui/primitives/button";
import { CopyLink } from "../context/copy-link";
import { CreateSourceTask } from "../context/create-source-task";
import { LinkMessageWork } from "../context/link-message-work";
import { MessageContext } from "../context/message-context";
import { ReferencedMessageBody } from "../context/referenced-message-body";
import { messageHref } from "@/lib/context-links";

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
  const target = useRef<HTMLDivElement>(null);
  const highlighted = search.messageId === message.id;
  useEffect(() => {
    if (highlighted) target.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);
  const [action, setAction] = useState<"create" | "link" | null>(null);
  const reaction = useMutation({
    mutationFn: async (emoji: string) =>
      toggleReaction({ data: { organizationId, messageId: message.id, emoji } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
  });
  return (
    <div
      ref={target}
      tabIndex={highlighted ? -1 : undefined}
      aria-label={highlighted ? "Linked message" : undefined}
      className={highlighted ? "rounded border-2 border-ring" : undefined}
    >
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
            <Button size="xs" variant="ghost" onClick={() => setAction("create")}>
              Create task
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setAction("link")}>
              Link existing work
            </Button>
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
    </div>
  );
}
