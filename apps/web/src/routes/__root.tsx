import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { NotFound } from "@/ui/feedback/not-found";
import { RouteErrorScreen } from "@/components/feedback/route-error-screen";
import { ThemeProvider } from "@/ui/theme/theme-provider";
import { ThemeControl } from "@/ui/theme/theme-control";

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
