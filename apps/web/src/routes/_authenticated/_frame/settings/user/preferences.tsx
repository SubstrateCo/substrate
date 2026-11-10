import { createFileRoute } from "@tanstack/react-router";

import { UserPreferences } from "@/components/settings/preferences/user-preferences";

export const Route = createFileRoute("/_authenticated/_frame/settings/user/preferences")({
  component: UserPreferences,
});
