import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Composer as ComposerView } from "@startup-os/ui/messaging/composer";
import { queryKeys } from "@/queries/keys";
import { sendMessage } from "@/server/messaging";

export function Composer({
  organizationId,
  conversationId,
  threadId,
  label,
}: {
  organizationId: string;
  conversationId: string;
  threadId?: string;
  label: string;
}) {
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: async (body: string) =>
      sendMessage({ data: { organizationId, conversationId, threadId, body } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
  });
  return (
    <ComposerView
      label={label}
      pending={send.isPending}
      error={send.error}
      onSend={(body, onSuccess) => send.mutate(body, { onSuccess })}
    />
  );
}
