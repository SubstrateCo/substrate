import type { DesktopSettingsAPI } from "@substrate/contracts/desktop/window";

import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "@/components/feedback/error-state";
import { SettingsCard, SettingsRow } from "@/components/layout/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { desktopSettingsBridge } from "@/lib/desktop/bridges";
import { useDesktopSettingsUpdate } from "@/queries/desktop/mutations";
import { desktopSettingsQueryOptions } from "@/queries/desktop/settings";
import { toast } from "sonner";

// Only the desktop app has this bridge. Browsers show nothing.
export function DesktopPreferences() {
  const bridge = desktopSettingsBridge();
  if (!bridge) return null;
  return <DesktopPreferencesCard bridge={bridge} />;
}

function DesktopPreferencesCard({ bridge }: { bridge: DesktopSettingsAPI }) {
  // The main process owns this setting, so read it fresh each time the card opens.
  const settings = useQuery(desktopSettingsQueryOptions(bridge));
  const update = useDesktopSettingsUpdate(bridge);
  return (
    <SettingsCard
      title="Desktop"
      description="Your agents run on this computer while Substrate is open."
    >
      {settings.isError ? (
        <ErrorState
          compact
          title="Couldn’t load desktop settings"
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
                onCheckedChange={(enabled) =>
                  update.mutate(enabled, {
                    onError: () => toast.error("We couldn’t change this setting. Try again."),
                  })
                }
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
