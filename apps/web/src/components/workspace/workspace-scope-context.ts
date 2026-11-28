import { getRouteApi } from "@tanstack/react-router";

const workspaceRoute = getRouteApi("/_authenticated/_frame/_workspace");

export function useWorkspaceScope() {
  return workspaceRoute.useRouteContext({
    select: ({ organizationId, userId }) => ({ organizationId, userId }),
  });
}
