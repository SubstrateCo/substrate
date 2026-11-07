import { createFileRoute, Outlet } from "@tanstack/react-router";

import { NonWorkspaceLayout } from "@/components/theme/non-workspace-layout";
import { authSearch } from "@/lib/auth/navigation";

export const Route = createFileRoute("/_public")({
  validateSearch: authSearch,
  component: PublicLayout,
});

function PublicLayout() {
  return (
    <NonWorkspaceLayout>
      <Outlet />
    </NonWorkspaceLayout>
  );
}
