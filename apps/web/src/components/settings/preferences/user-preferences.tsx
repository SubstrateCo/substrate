import { DesktopUpdateSettings } from "@/components/desktop-updates/desktop-update-settings";
import { SettingsPanel } from "@/components/layout/settings-page";
import { SettingsCard, SettingsRow } from "@/components/layout/settings-section";
import { DesktopPreferences } from "@/components/settings/preferences/desktop-preferences";
import { ThemeControl } from "@/components/theme/theme-control";

export function UserPreferences() {
  return (
    <SettingsPanel title="Preferences" description="Settings for this device only.">
      <SettingsCard title="Appearance">
        <SettingsRow
          label="Theme"
          description="System follows your computer’s light or dark setting."
          control={<ThemeControl />}
        />
      </SettingsCard>
      <DesktopPreferences />
      <DesktopUpdateSettings />
    </SettingsPanel>
  );
}
