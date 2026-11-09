import { useLocation, useNavigate } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { UserSettingsLayout as UserSettingsLayoutView } from "@/components/settings/user-settings-layout-view";

export function UserSettingsLayout({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  let active: "invitations" | "profile" = "profile";
  if (pathname.endsWith("/invitations")) active = "invitations";
  return (
    <UserSettingsLayoutView
      active={active}
      onTabChange={(tab) => {
        const targets = {
          profile: "/settings/user",
          invitations: "/settings/user/invitations",
        } as const;
        void navigate({ to: targets[tab] });
      }}
    >
      {children}
    </UserSettingsLayoutView>
  );
}
