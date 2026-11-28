import { appEnabled, type AppId } from "@substrate/contracts/apps";

import { useQuery } from "@tanstack/react-query";

import { recordQueries } from "./queries";
import type { QueryScope } from "@/queries/keys";

export function useWorkspaceApps(scope: QueryScope) {
  const query = useQuery(recordQueries.apps(scope));
  return {
    query,
    enabled: (app: AppId) => !!query.data && appEnabled(query.data.enabledApps, app),
  };
}
