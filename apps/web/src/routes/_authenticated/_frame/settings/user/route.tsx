import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsShell } from "@/components/settings/settings-shell";

export const Route = createFileRoute("/_authenticated/_frame/settings/user")({
  component: UserSettingsRoute,
});

function UserSettingsRoute() {
  return (
    <SettingsShell>
      <Outlet />
    </SettingsShell>
  );
}
