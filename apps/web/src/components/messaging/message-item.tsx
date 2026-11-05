import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageItem as MessageItemView } from "@startup-os/ui/messaging/message-item";
import type { Message } from "@/lib/messaging";
import { queryKeys } from "@/queries/keys";
import { toggleReaction } from "@/server/messaging";

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
  const reaction = useMutation({
    mutationFn: async (emoji: string) =>
      toggleReaction({ data: { organizationId, messageId: message.id, emoji } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
  });
  return (
    <MessageItemView
      message={message}
      onThread={onThread}
      onReact={(emoji) => reaction.mutate(emoji)}
      pending={reaction.isPending}
      error={reaction.error}
    />
  );
}
