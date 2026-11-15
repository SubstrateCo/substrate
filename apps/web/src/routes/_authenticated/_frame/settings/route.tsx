import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsShell } from "@/components/settings/settings-shell";

// User and organization settings share this layout, so the settings frame stays mounted between
// them. User settings also work without an active organization.
export const Route = createFileRoute("/_authenticated/_frame/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { session } = Route.useRouteContext();
  return (
    <SettingsShell organizationId={session.session.activeOrganizationId ?? null}>
      <Outlet />
    </SettingsShell>
  );
}
