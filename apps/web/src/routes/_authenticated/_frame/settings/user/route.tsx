import { createFileRoute, Outlet } from "@tanstack/react-router";

import { UserSettingsLayout } from "@/components/settings/user-settings-layout";

export const Route = createFileRoute("/_authenticated/_frame/settings/user")({
  component: UserSettingsRoute,
});

function UserSettingsRoute() {
  return (
    <UserSettingsLayout>
      <Outlet />
    </UserSettingsLayout>
  );
}
