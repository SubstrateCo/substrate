import { createFileRoute, Outlet } from "@tanstack/react-router";

import { DesktopSignIn } from "@/components/auth/desktop/desktop-sign-in";
import { isDesktop } from "@/lib/desktop/auth";
import { electronQuery } from "@/lib/desktop/authorization-query";
import { redirectAuthenticatedSession } from "@/route-guards/auth";

export const Route = createFileRoute("/_public/_guest")({
  ssr: false,
  beforeLoad: async ({ context, search }) => {
    if (electronQuery(search)) return;
    await redirectAuthenticatedSession(context.queryClient, search.redirect);
  },
  component: GuestLayout,
});

function GuestLayout() {
  const { redirect } = Route.useSearch();
  if (isDesktop()) return <DesktopSignIn redirect={redirect} />;
  return <Outlet />;
}
