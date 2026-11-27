import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet, useRouter } from "@tanstack/react-router";

import { ErrorScreen } from "@/components/feedback/error-screen";
import { NotFound } from "@/components/feedback/not-found";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  notFoundComponent: () => <NotFound homeLink={<Link to="/messages">Go to your workspace</Link>} />,
  errorComponent: RootError,
});

function RootError() {
  const router = useRouter();
  return <ErrorScreen onRetry={() => void router.invalidate()} />;
}
