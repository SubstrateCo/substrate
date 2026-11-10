import { createFileRoute } from "@tanstack/react-router";

import { AcceptSharingScreen } from "@/components/messaging/sharing/accept-sharing-screen";
import { NonWorkspaceLayout } from "@/components/theme/non-workspace-layout";

export const Route = createFileRoute("/_authenticated/accept-sharing/$invitationId")({
  component: AcceptSharing,
});
function AcceptSharing() {
  return (
    <NonWorkspaceLayout>
      <AcceptSharingScreen invitationId={Route.useParams().invitationId} />
    </NonWorkspaceLayout>
  );
}
