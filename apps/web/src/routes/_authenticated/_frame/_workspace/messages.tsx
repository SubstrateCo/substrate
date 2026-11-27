import { createFileRoute } from "@tanstack/react-router";

import { MessagingWorkspace } from "@/components/messaging/workspace/messaging-workspace";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/messages")({
  component: MessagesRoute,
  validateSearch: z.object({
    conversationId: z.uuid().optional(),
    messageId: z.uuid().optional(),
    turnId: z.uuid().optional(),
    sourceType: z.enum(["deal", "account", "contact"]).optional(),
    sourceId: z.uuid().optional(),
    /** Opens the task of a task discussion, or the deal or account it was opened from. */
    sheet: z.boolean().optional(),
  }),
});
function MessagesRoute() {
  const { conversationId, messageId, turnId, sourceType, sourceId, sheet } = Route.useSearch();
  return (
    <MessagingWorkspace
      conversationId={conversationId}
      messageId={messageId}
      turnId={turnId}
      source={sourceType && sourceId ? { type: sourceType, entityId: sourceId } : undefined}
      sheet={sheet}
    />
  );
}
