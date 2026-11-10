import { createFileRoute } from "@tanstack/react-router";

import { AcceptInvitationScreen } from "@/components/organizations/invitations/accept-invitation-screen";

export const Route = createFileRoute("/_authenticated/_standalone/accept-invitation/$invitationId")(
  {
    component: AcceptInvitation,
  },
);
function AcceptInvitation() {
  return <AcceptInvitationScreen invitationId={Route.useParams().invitationId} />;
}
