import { useLocation } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { UserSettingsLayout as UserSettingsLayoutView } from "@/ui/settings/user-settings-layout";

export function UserSettingsLayout({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  let active: "agents" | "invitations" | "profile" = "profile";
  if (pathname.endsWith("/agents")) active = "agents";
  if (pathname.endsWith("/invitations")) active = "invitations";
  return (
    <UserSettingsLayoutView
      active={active}
      profileHref="/settings/user"
      invitationsHref="/settings/user/invitations"
      agentsHref="/settings/user/agents"
    >
      {children}
    </UserSettingsLayoutView>
  );
}
