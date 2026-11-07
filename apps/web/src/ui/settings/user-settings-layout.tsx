import type { ReactNode } from "react";

import { WorkspaceSettings } from "../workspace/workspace-settings";

export function UserSettingsLayout({
  children,
  active,
  profileHref,
  invitationsHref,
  agentsHref,
}: {
  children: ReactNode;
  active: "profile" | "invitations" | "agents";
  profileHref: string;
  invitationsHref: string;
  agentsHref: string;
}) {
  return (
    <WorkspaceSettings title="User settings">
      <nav aria-label="User settings" className="flex gap-4 border-b pb-3 text-sm">
        <a
          href={profileHref}
          aria-current={active === "profile" ? "page" : undefined}
          className={active === "profile" ? "font-semibold underline" : undefined}
        >
          Profile and appearance
        </a>
        <a
          href={invitationsHref}
          aria-current={active === "invitations" ? "page" : undefined}
          className={active === "invitations" ? "font-semibold underline" : undefined}
        >
          Invitations
        </a>
        <a
          href={agentsHref}
          aria-current={active === "agents" ? "page" : undefined}
          className={active === "agents" ? "font-semibold underline" : undefined}
        >
          Agents
        </a>
      </nav>
      {children}
    </WorkspaceSettings>
  );
}
