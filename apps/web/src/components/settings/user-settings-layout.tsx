import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { WorkspaceSettings } from "@startup-os/ui/workspace/workspace-settings";

export function UserSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceSettings title="User settings">
      <nav aria-label="User settings" className="flex gap-4 border-b pb-3 text-sm">
        <Link
          to="/settings/user"
          activeOptions={{ exact: true }}
          activeProps={{ className: "font-semibold underline" }}
        >
          Appearance
        </Link>
        <Link
          to="/settings/user/invitations"
          activeProps={{ className: "font-semibold underline" }}
        >
          Invitations
        </Link>
      </nav>
      {children}
    </WorkspaceSettings>
  );
}
