import { UserProfile } from "./user-profile";
import { UserAppearance } from "@/ui/settings/user-appearance";

export function UserSettingsHome() {
  return (
    <>
      <UserProfile />
      <UserAppearance />
    </>
  );
}
