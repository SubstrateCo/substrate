import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { WorkspaceShell } from "@startup-os/ui/workspace/workspace-shell";
import {
  activeMemberQueryOptions,
  organizationQueryOptions,
} from "@/queries/organizations/options";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { MessagingWorkspace } from "@/components/messaging/messaging-workspace";
import { WorkspaceSettings } from "./workspace-settings";

export function Dashboard({ organizationId, name }: { organizationId: string; name: string }) {
  return <WorkspaceDashboard key={organizationId} organizationId={organizationId} name={name} />;
}

function WorkspaceDashboard({ organizationId, name }: { organizationId: string; name: string }) {
  const [view, setView] = useState<"messages" | "settings">("messages");
  const organization = useQuery(organizationQueryOptions(organizationId));
  const member = useQuery(activeMemberQueryOptions(organizationId));
  const isOwner =
    member.data?.organizationId === organizationId && member.data.role.split(",").includes("owner");
  const isAdmin =
    isOwner ||
    (member.data?.organizationId === organizationId &&
      member.data.role.split(",").includes("admin"));
  return (
    <WorkspaceShell
      name={name}
      view={view}
      onViewChange={setView}
      showSettings={!!isAdmin}
      switcher={
        <OrganizationSwitcher
          organizationId={organizationId}
          name={organization.data?.name || "Workspace"}
          compact
        />
      }
      signOut={<SignOutButton compact />}
      error={organization.error || member.error}
    >
      {view === "settings" && isAdmin ? (
        <WorkspaceSettings organizationId={organizationId} isOwner={!!isOwner} />
      ) : (
        <MessagingWorkspace
          organizationId={organizationId}
          workspaceName={organization.data?.name || "Workspace"}
        />
      )}
    </WorkspaceShell>
  );
}
