import { createFileRoute } from "@tanstack/react-router";
import { requireVerifiedSession } from "@/queries/auth/session";
import { AcceptInvitationScreen } from "@/components/organizations/accept-invitation-screen";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  ssr: false,
  beforeLoad: async ({ context, params }) => {
    await requireVerifiedSession(
      context.queryClient,
      `/accept-invitation/${encodeURIComponent(params.invitationId)}`,
    );
  },
  component: AcceptInvitation,
});
function AcceptInvitation() {
  return <AcceptInvitationScreen invitationId={Route.useParams().invitationId} />;
}
