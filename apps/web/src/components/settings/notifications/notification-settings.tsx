import type {
  AccountNotificationPreferences,
  NotificationSchedule,
} from "@substrate/contracts/notifications/preferences";

import { useQuery } from "@tanstack/react-query";

import { AlertAppearanceSettings, AlertSettings } from "./notification-sections";
import { WorkspaceNotificationSettings } from "./workspace-notification-settings";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { SettingsPanel } from "@/components/layout/settings-page";
import { localTimeZone } from "@/lib/format/date";
import { resourceState } from "@/lib/resource-state";
import {
  accountNotificationPreferencesOptions,
  useUpdateAccountNotificationPreferences,
} from "@/queries/notifications/preferences";
import { toast } from "sonner";

const settingError = () => toast.error("We couldn’t change this setting. Try again.");

const defaultSchedule = { days: [1, 2, 3, 4, 5], start: 9 * 60, end: 18 * 60 };

export function NotificationSettings({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string | null;
}) {
  const account = useQuery(accountNotificationPreferencesOptions(userId));
  const update = useUpdateAccountNotificationPreferences(userId);
  const state = resourceState(account);
  const save = (change: Partial<AccountNotificationPreferences>) =>
    update.mutate(change, { onError: settingError });
  const saveSchedule = (
    current: NotificationSchedule | null,
    change: Partial<Omit<NotificationSchedule, "timeZone">>,
  ) => {
    const { timeZone: _, ...base } = current ?? { ...defaultSchedule, timeZone: "" };
    save({ schedule: { ...base, ...change, timeZone: localTimeZone() } });
  };
  const retry = () => void account.refetch();
  return (
    <SettingsPanel
      title="Notifications"
      description="Choose when Substrate alerts you and what alerts show."
    >
      <div className="min-w-0 space-y-8 border-t pt-6">
        {state.status === "loading" && <LoadingState label="Loading notification settings" />}
        {state.status === "stale" && (
          <StaleNotice title="Couldn’t load notification settings" onRetry={retry} />
        )}
        {state.data === undefined && state.status !== "loading" && (
          <ErrorState
            variant="compact"
            title="Couldn’t load notification settings"
            onRetry={retry}
          />
        )}
        {state.data && (
          <>
            <AlertSettings
              preferences={state.data}
              pending={update.isPending}
              onChange={save}
              onScheduleChange={(change) => saveSchedule(state.data!.schedule, change)}
            />
            <AlertAppearanceSettings
              preferences={state.data}
              pending={update.isPending}
              onChange={save}
            />
          </>
        )}
        {organizationId && (
          <WorkspaceNotificationSettings userId={userId} organizationId={organizationId} />
        )}
      </div>
    </SettingsPanel>
  );
}
