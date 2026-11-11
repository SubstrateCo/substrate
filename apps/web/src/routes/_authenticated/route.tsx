import { createFileRoute, Outlet } from "@tanstack/react-router";

import { RealtimeConnection } from "@/components/realtime/realtime-connection";
import { requireVerifiedSession } from "@/lib/auth/route-access";

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
      <Outlet />
    </RealtimeConnection>
  );
}
