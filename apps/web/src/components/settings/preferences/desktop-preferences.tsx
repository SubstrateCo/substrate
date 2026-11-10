import type { DesktopSettingsAPI } from "@startup-os/contracts/desktop/window";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorState } from "@/components/feedback/error-state";
import { SettingsCard, SettingsRow } from "@/components/layout/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { queryKeys } from "@/queries/keys";
import { toast } from "sonner";

// Only the desktop app has this bridge. Browsers show nothing.
export function DesktopPreferences() {
  const bridge = window.startupOSDesktopSettings;
  if (!bridge) return null;
  return <DesktopPreferencesCard bridge={bridge} />;
}

function DesktopPreferencesCard({ bridge }: { bridge: DesktopSettingsAPI }) {
  const queryClient = useQueryClient();
  // The main process owns this setting, so read it fresh each time the card opens.
  const settings = useQuery({
    queryKey: queryKeys.desktopSettings,
    queryFn: () => bridge.get(),
    staleTime: 0,
    retry: false,
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) => bridge.setLaunchAtLogin(enabled),
    onSuccess: (next) => queryClient.setQueryData(queryKeys.desktopSettings, next),
    onError: () => toast.error("We couldn't change this setting. Try again."),
  });
  return (
    <SettingsCard
      title="Desktop"
      description="Your agents run on this computer while Startup OS is open."
    >
      {settings.isError ? (
        <ErrorState
          compact
          title="Couldn't load desktop settings"
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <SettingsRow
          label="Open at login"
          htmlFor="desktop-launch-at-login"
          description="Start hidden in the tray when you sign in to this computer, so agents keep running."
          control={
            settings.data ? (
              <Switch
                id="desktop-launch-at-login"
                checked={settings.data.launchAtLogin}
                disabled={update.isPending}
                onCheckedChange={(enabled) => update.mutate(enabled)}
              />
            ) : (
              <Skeleton role="status" aria-label="Loading" className="h-5 w-9" />
            )
          }
        />
      )}
    </SettingsCard>
  );
}
