import { createFileRoute, Outlet } from "@tanstack/react-router";

import { DesktopUpdateNotice } from "@/components/desktop-updates/desktop-update-notice";
import { RealtimeConnection } from "@/components/realtime/realtime-connection";
import { requireVerifiedSession } from "@/route-guards/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
  beforeLoad: async ({
    context,
    location,
  }): Promise<{
    session: Awaited<ReturnType<typeof requireVerifiedSession>>;
  }> => ({
    session: await requireVerifiedSession(context.queryClient, location.href),
  }),
});

function AuthenticatedLayout() {
  const { session } = Route.useRouteContext();
  return (
    <RealtimeConnection
      userId={session.user.id}
      organizationId={session.session.activeOrganizationId ?? null}
    >
      <DesktopUpdateNotice />
      <Outlet />
    </RealtimeConnection>
  );
}
