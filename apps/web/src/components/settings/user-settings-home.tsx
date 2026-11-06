import { UserProfile } from "./user-profile";
import { UserAppearance } from "@startup-os/ui/settings/user-appearance";

export function UserSettingsHome() {
  return (
    <>
      <UserProfile />
      <UserAppearance />
    </>
  );
}
