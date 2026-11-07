import { UserProfile } from "./user-profile";
import { UserAppearance } from "@/components/settings/user-appearance";

export function UserSettingsHome() {
  return (
    <>
      <UserProfile />
      <UserAppearance />
    </>
  );
}
