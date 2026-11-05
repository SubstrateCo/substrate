import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MessageSquare, Settings } from "lucide-react";
import {
  activeMemberQueryOptions,
  organizationQueryOptions,
} from "@/queries/organizations/options";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
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
    <main className="flex h-dvh min-h-0 overflow-hidden bg-background">
      <nav
        aria-label="Apps"
        className="flex w-16 shrink-0 flex-col items-center gap-5 bg-[#191b24] py-5 text-white"
      >
        <OrganizationSwitcher
          organizationId={organizationId}
          name={organization.data?.name || "Workspace"}
          compact
        />
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Messages"
          title="Messages"
          aria-current={view === "messages" ? "page" : undefined}
          className={
            view === "messages"
              ? "bg-white/15 text-white hover:bg-white/20 hover:text-white"
              : "text-white/60 hover:bg-white/10 hover:text-white"
          }
          onClick={() => setView("messages")}
        >
          <MessageSquare className="size-5" />
        </Button>
        <div className="mt-auto flex flex-col items-center gap-4">
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Settings"
              title="Settings"
              aria-current={view === "settings" ? "page" : undefined}
              className="text-white/60 hover:bg-white/10 hover:text-white"
              onClick={() => setView("settings")}
            >
              <Settings className="size-5" />
            </Button>
          )}
          <div
            title={name}
            aria-label={`Signed in as ${name}`}
            className="flex size-8 items-center justify-center rounded-lg bg-indigo-300 text-xs font-semibold text-indigo-950"
          >
            {name.slice(0, 2).toUpperCase()}
          </div>
          <SignOutButton compact />
        </div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {(organization.isError || member.isError) && (
          <div className="p-3">
            <FormMessage error={organization.error || member.error} />
          </div>
        )}
        {view === "settings" && isAdmin ? (
          <WorkspaceSettings organizationId={organizationId} isOwner={!!isOwner} />
        ) : (
          <MessagingWorkspace
            organizationId={organizationId}
            workspaceName={organization.data?.name || "Workspace"}
          />
        )}
      </div>
    </main>
  );
}
