import { createFileRoute } from "@tanstack/react-router";

import { MessagingWorkspace } from "@/components/messaging/workspace/messaging-workspace";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_workspace/dashboard")({
  component: DashboardRoute,
  validateSearch: z.object({
    conversationId: z.uuid().optional(),
    messageId: z.uuid().optional(),
    turnId: z.uuid().optional(),
  }),
});
function DashboardRoute() {
  const { organizationId, session } = Route.useRouteContext();
  return <MessagingWorkspace organizationId={organizationId} userId={session.user.id} />;
}
