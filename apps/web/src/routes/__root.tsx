import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";

import { NotFound } from "@/components/feedback/not-found";
import { RouteErrorScreen } from "@/components/feedback/route-error-screen";
import { ThemeControl } from "@/components/theme/theme-control";
import { ThemeProvider } from "@/components/theme/theme-provider";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: () => <NotFound homeLink={<Link to="/">Return home</Link>} />,
  errorComponent: RouteErrorScreen,
});

function Root() {
  return (
    <ThemeProvider>
      <Outlet />
      <ThemeControl />
    </ThemeProvider>
  );
}
