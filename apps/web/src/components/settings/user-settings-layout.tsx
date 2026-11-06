import { useLocation } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { UserSettingsLayout as UserSettingsLayoutView } from "@/ui/settings/user-settings-layout";

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
