import { createFileRoute, Outlet } from "@tanstack/react-router";

import { NonWorkspaceLayout } from "@/components/theme/non-workspace-layout";

export const Route = createFileRoute("/_authenticated/_standalone")({
  component: StandaloneLayout,
});

function StandaloneLayout() {
  return (
    <NonWorkspaceLayout>
      <Outlet />
    </NonWorkspaceLayout>
  );
}
