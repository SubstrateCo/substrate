import { createFileRoute } from "@tanstack/react-router";

import { MessagingWorkspace } from "@/components/messaging/workspace/messaging-workspace";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/messages")({
  component: MessagesRoute,
  validateSearch: z.object({
    conversationId: z.uuid().optional(),
    messageId: z.uuid().optional(),
    turnId: z.uuid().optional(),
  }),
});
function MessagesRoute() {
  const { conversationId, messageId, turnId } = Route.useSearch();
  return (
    <MessagingWorkspace conversationId={conversationId} messageId={messageId} turnId={turnId} />
  );
}
