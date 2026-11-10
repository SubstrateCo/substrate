import { createFileRoute } from "@tanstack/react-router";

import { UserProfile } from "@/components/settings/profile/user-profile";

export const Route = createFileRoute("/_authenticated/_frame/settings/user/")({
  component: UserProfile,
});
