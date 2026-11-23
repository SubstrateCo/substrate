import { createFileRoute } from "@tanstack/react-router";

import { DesktopInbox } from "@/components/inbox/desktop-inbox";
import { AppAvailability } from "@/components/workspace/app-availability";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/inbox/")({
  component: InboxRoute,
});
function InboxRoute() {
  const { session, organizationId } = Route.useRouteContext();
  return (
    <AppAvailability app="inbox">
      <DesktopInbox
        key={`${session.user.id}:${organizationId}`}
        scope={{ userId: session.user.id, organizationId }}
      />
    </AppAvailability>
  );
}
