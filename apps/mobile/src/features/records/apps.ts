import { appEnabled, type AppId } from "@substrate/contracts/apps";

import { useQuery } from "@tanstack/react-query";

import { recordQueries } from "./queries";
import type { QueryScope } from "@/queries/keys";

/** The workspace's enabled apps. Screens hide a gated app's data until this loads. */
export function useWorkspaceApps(scope: QueryScope) {
  const query = useQuery(recordQueries.apps(scope));
  return {
    query,
    enabled: (app: AppId) => !!query.data && appEnabled(query.data.enabledApps, app),
  };
}
