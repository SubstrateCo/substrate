import { appEnabled, requiredAppsForEntityType, type AppId } from "@substrate/contracts/apps";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState, type ReactNode } from "react";

import { AppsContext } from "./organization-apps-context";
import { organizationAppsOptions } from "@/queries/organizations/apps";
import { clearAppData } from "@/queries/organizations/apps-cache";

export function OrganizationAppsProvider({
  userId,
  organizationId,
  children,
}: {
  userId: string;
  organizationId?: string | null;
  children: ReactNode;
}) {
  const client = useQueryClient();
  const settings = useQuery(organizationAppsOptions(organizationId));
  const signature = settings.data?.enabledApps.slice().sort().join(",");
  const [applied, setApplied] = useState(signature);
  const ready = !!settings.data && !settings.error && applied === signature;
  const enabled = (app: AppId) =>
    !!settings.data && ready && appEnabled(settings.data.enabledApps, app);
  useEffect(() => {
    if (signature === undefined || signature === applied) return;
    // Keep optional workspaces unmounted until old reads are gone. Otherwise enabling an app
    // can start a new read that the cache cleanup immediately cancels.
    let active = true;
    const cleanup =
      applied === undefined ? Promise.resolve() : clearAppData(client, organizationId!, userId);
    void cleanup.then(() => {
      if (active) setApplied(signature);
    });
    return () => {
      active = false;
    };
  }, [applied, client, organizationId, signature, userId]);
  return (
    <AppsContext.Provider
      value={{
        ready,
        enabled,
        entityEnabled: (type) => requiredAppsForEntityType(type).every(enabled),
        error: settings.error,
        retry: () => void settings.refetch(),
      }}
    >
      {children}
    </AppsContext.Provider>
  );
}
