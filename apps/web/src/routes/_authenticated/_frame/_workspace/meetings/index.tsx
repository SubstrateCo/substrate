import { createFileRoute } from "@tanstack/react-router";

import { MeetingsWorkspace } from "@/components/meetings/meetings-workspace";
import { AppAvailability } from "@/components/workspace/app-availability";
import { meetingSearch } from "@/lib/meetings/navigation";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/meetings/")({
  validateSearch: meetingSearch,
  component: MeetingsRoute,
});
function MeetingsRoute() {
  const { session, organizationId } = Route.useRouteContext();
  return (
    <AppAvailability app="meetings">
      <MeetingsWorkspace
        key={`${session.user.id}:${organizationId}`}
        scope={{ userId: session.user.id, organizationId }}
        search={Route.useSearch()}
      />
    </AppAvailability>
  );
}
