import { createFileRoute } from "@tanstack/react-router";

import { AcceptInvitationScreen } from "@/components/organizations/invitations/accept-invitation-screen";
import { NonWorkspaceLayout } from "@/components/theme/non-workspace-layout";

export const Route = createFileRoute("/_authenticated/accept-invitation/$invitationId")({
  component: AcceptInvitation,
});
function AcceptInvitation() {
  return (
    <NonWorkspaceLayout>
      <AcceptInvitationScreen invitationId={Route.useParams().invitationId} />
    </NonWorkspaceLayout>
  );
}
