import { createFileRoute } from "@tanstack/react-router";

import { UserInvitations } from "@/components/settings/invitations/user-invitations";

export const Route = createFileRoute("/_authenticated/_frame/settings/user/invitations")({
  component: UserInvitations,
});
