import { UserProfile } from "./profile/user-profile";
import { DesktopPreferences } from "@/components/settings/desktop-preferences";
import { UserAppearance } from "@/components/settings/user-appearance";

export function UserSettingsHome() {
  return (
    <>
      <UserProfile />
      <UserAppearance />
      <DesktopPreferences />
    </>
  );
}
