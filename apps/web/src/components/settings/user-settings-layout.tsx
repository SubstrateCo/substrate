import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { UserSettingsLayout as UserSettingsLayoutView } from "@startup-os/ui/settings/user-settings-layout";

export function UserSettingsLayout({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <UserSettingsLayoutView
      active={pathname.endsWith("/invitations") ? "invitations" : "profile"}
      profileHref="/settings/user"
      invitationsHref="/settings/user/invitations"
    >
      {children}
    </UserSettingsLayoutView>
  );
}
