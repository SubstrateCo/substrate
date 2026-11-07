import type { ReactNode } from "react";

import { WorkspaceSettings } from "./workspace-settings-view";

export function OrganizationSettings({
  picture,
  invitations,
  isOwner,
}: {
  picture: ReactNode;
  invitations: ReactNode;
  isOwner: boolean;
}) {
  return (
    <WorkspaceSettings>
      {picture}
      {isOwner ? (
        invitations
      ) : (
        <p className="text-sm text-muted-foreground">
          Only organization owners can send and manage invitations.
        </p>
      )}
    </WorkspaceSettings>
  );
}
