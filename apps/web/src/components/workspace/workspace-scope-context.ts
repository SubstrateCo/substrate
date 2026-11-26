import { getRouteApi } from "@tanstack/react-router";

const workspaceRoute = getRouteApi("/_authenticated/_frame/_workspace");

/** The active organization and signed-in user, from the `_workspace` route context. */
export function useWorkspaceScope() {
  return workspaceRoute.useRouteContext({
    select: ({ organizationId, userId }) => ({ organizationId, userId }),
  });
}
