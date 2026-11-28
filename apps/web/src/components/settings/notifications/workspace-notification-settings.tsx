import { useQuery } from "@tanstack/react-query";

import { WorkspaceAlertSettings } from "./notification-sections";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { resourceState } from "@/lib/resource-state";
import {
  useUpdateWorkspaceNotificationPreferences,
  workspaceNotificationPreferencesOptions,
} from "@/queries/notifications/preferences";
import { toast } from "sonner";

const settingError = () => toast.error("We couldn’t change this setting. Try again.");

export function WorkspaceNotificationSettings({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const workspace = useQuery(workspaceNotificationPreferencesOptions(userId, organizationId));
  const update = useUpdateWorkspaceNotificationPreferences(userId, organizationId);
  const state = resourceState(workspace);
  const retry = () => void workspace.refetch();
  if (state.status === "loading") return <LoadingState label="Loading workspace settings" />;
  if (state.data === undefined)
    return (
      <ErrorState
        variant="compact"
        title="Couldn’t load workspace settings"
        onRetry={state.status === "unavailable" ? undefined : retry}
      />
    );
  return (
    <>
      {state.status === "stale" && (
        <StaleNotice title="Couldn’t load workspace settings" onRetry={retry} />
      )}
      <WorkspaceAlertSettings
        preferences={state.data}
        pending={update.isPending}
        onChange={(change) => update.mutate(change, { onError: settingError })}
      />
    </>
  );
}
