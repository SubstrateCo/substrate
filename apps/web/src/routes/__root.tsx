import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { NotFound } from "@startup-os/ui/feedback/not-found";
import { RouteErrorScreen } from "@/components/feedback/route-error-screen";
import { ThemeProvider } from "@startup-os/ui/theme/theme-provider";
import { ThemeSwitcher } from "@startup-os/ui/theme/theme-switcher";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: () => <NotFound homeLink={<Link to="/">Return home</Link>} />,
  errorComponent: RouteErrorScreen,
});

function Root() {
  return (
    <ThemeProvider>
      <Outlet />
      <div
        className="fixed right-4 top-4 z-40 rounded-lg bg-popover shadow-surface"
        data-theme-control
      >
        <ThemeSwitcher />
      </div>
    </ThemeProvider>
  );
}
