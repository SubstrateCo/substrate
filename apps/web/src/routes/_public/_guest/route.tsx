import { createFileRoute, Outlet } from "@tanstack/react-router";

import { DesktopSignIn } from "@/components/auth/desktop/desktop-sign-in";
import { redirectAuthenticatedSession } from "@/lib/auth/route-access";
import { isDesktop } from "@/lib/desktop/auth";

export const Route = createFileRoute("/_public/_guest")({
  ssr: false,
  beforeLoad: async ({ context, search }) => {
    if (search.client_id === "electron" && search.state && search.code_challenge) return;
    await redirectAuthenticatedSession(context.queryClient, search.redirect);
  },
  component: GuestLayout,
});

// In the desktop app, login and signup both continue in the browser.
function GuestLayout() {
  const { redirect } = Route.useSearch();
  if (isDesktop()) return <DesktopSignIn redirect={redirect} />;
  return <Outlet />;
}
