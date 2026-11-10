import { createFileRoute } from "@tanstack/react-router";

import { AcceptSharingScreen } from "@/components/messaging/sharing/accept-sharing-screen";

export const Route = createFileRoute("/_authenticated/_standalone/accept-sharing/$invitationId")({
  component: AcceptSharing,
});
function AcceptSharing() {
  return <AcceptSharingScreen invitationId={Route.useParams().invitationId} />;
}
