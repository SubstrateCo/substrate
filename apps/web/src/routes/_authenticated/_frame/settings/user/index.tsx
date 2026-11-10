import { createFileRoute } from "@tanstack/react-router";

import { UserSettingsHome } from "@/components/settings/user-settings-home";

export const Route = createFileRoute("/_authenticated/_frame/settings/user/")({
  component: UserSettingsHome,
});
