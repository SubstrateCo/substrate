import { DesktopUpdateSettings } from "@/components/desktop-updates/desktop-update-settings";
import { SettingsPanel } from "@/components/layout/settings-page";
import { SettingsSection, SettingsRow } from "@/components/layout/settings-section";
import { DesktopPreferences } from "@/components/settings/preferences/desktop-preferences";
import { KeyboardShortcutsSettings } from "@/components/settings/preferences/keyboard-shortcuts-settings";
import { QuickReactionsSettings } from "@/components/settings/preferences/quick-reactions-settings";
import { ThemeControl } from "@/components/theme/theme-control";

export function UserPreferences() {
  return (
    <SettingsPanel title="Preferences" description="Settings for this device only.">
      <div className="min-w-0 space-y-8 border-t pt-6">
        <SettingsSection title="Appearance">
          <SettingsRow
            label="Theme"
            description="System follows your computer’s light or dark setting."
            control={<ThemeControl />}
          />
        </SettingsSection>
        <QuickReactionsSettings />
        <KeyboardShortcutsSettings />
        <DesktopPreferences />
        <DesktopUpdateSettings />
      </div>
    </SettingsPanel>
  );
}
