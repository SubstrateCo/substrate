import type { AppId } from "@substrate/contracts/apps";
import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Tag } from "@/components/feedback/tag";
import { SettingsPanel } from "@/components/layout/settings-page";
import {
  SettingsCard,
  SettingsNote,
  SettingsRow,
  SettingsSection,
} from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { workspaceApps } from "@/components/workspace/workspace-apps";
import { organizationAppsOptions, useUpdateOrganizationApps } from "@/queries/organizations/apps";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";
import { ShieldCheck, Users } from "lucide-react";

const catalog = [
  {
    id: "messages",
    description: "Keep conversations, channels, and shared context together.",
    required: true,
  },
  {
    id: "agents",
    description: "Work with your agents, review requests, and manage their home desktops.",
    required: true,
  },
  {
    id: "tasks",
    description:
      "Plan projects, assign tasks, and track work. Includes Projects and CRM follow-up tasks.",
    required: false,
  },
  {
    id: "crm",
    description:
      "Manage accounts, deals, and customer relationships. Enable independently of Tasks.",
    required: false,
  },
] as const satisfies ReadonlyArray<{ id: AppId; description: string; required: boolean }>;

export function OrganizationApps({ organizationId }: { organizationId: string }) {
  const settings = useQuery(organizationAppsOptions(organizationId));
  const organization = useQuery(currentOrganizationQueryOptions(organizationId));
  const mutation = useUpdateOrganizationApps(organizationId);
  const [disabling, setDisabling] = useState<"tasks" | "crm" | null>(null);
  const canManage = organizationSettingsAccess(organization.data?.role).allowed;
  const change = (app: AppId, enabled: boolean) => {
    if (!settings.data || !canManage) return;
    const next = settings.data.enabledApps.filter((item) => item !== app);
    if (enabled) next.push(app);
    mutation.mutate(next, { onSuccess: () => setDisabling(null) });
  };
  return (
    <SettingsPanel
      title="Apps"
      description="Choose the tools your organization uses. Changes apply to everyone in this workspace."
    >
      <SettingsNote icon={<ShieldCheck aria-hidden />}>
        {canManage
          ? "Owners and admins manage apps for the whole organization. Disabling an app preserves its data and blocks access until it is enabled again."
          : "You can view your organization’s apps. Ask an owner or admin to enable or disable an app."}
      </SettingsNote>
      {settings.isPending && <LoadingState label="Loading apps…" />}
      {settings.error && (
        <ErrorState
          title="Couldn’t load apps"
          description="Try again to view this organization’s apps."
          onRetry={() => void settings.refetch()}
        />
      )}
      {settings.data && !settings.error && (
        <>
          <SettingsSection
            title="Workspace apps"
            description="Messages and Agents are always available. Add other apps when your team needs them."
          >
            <div className="grid gap-4">
              {catalog.map((entry) => {
                const app = workspaceApps.find((item) => item.id === entry.id)!;
                const Icon = app.icon;
                const enabled = settings.data.enabledApps.includes(entry.id);
                let status = enabled ? "Enabled" : "Disabled";
                if (entry.required) status = "Required";
                return (
                  <SettingsCard key={entry.id} label={app.label}>
                    <SettingsRow
                      label={app.label}
                      description={entry.description}
                      control={
                        <div className="flex items-center gap-3">
                          <Tag>{status}</Tag>
                          {!entry.required && canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={mutation.isPending}
                              onClick={() => {
                                mutation.reset();
                                if (enabled) setDisabling(entry.id);
                                else change(entry.id, true);
                              }}
                            >
                              {enabled ? `Disable ${app.label}` : `Enable ${app.label}`}
                            </Button>
                          )}
                        </div>
                      }
                    />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="size-4" aria-hidden />
                      {entry.required ? "Included in every workspace" : "Organization-wide"}
                    </div>
                  </SettingsCard>
                );
              })}
            </div>
          </SettingsSection>
          <SettingsNote icon={<Users aria-hidden />}>
            Contacts stay available across the workspace, whether CRM is enabled or not.
          </SettingsNote>
          {mutation.error && !disabling && (
            <ErrorState
              title="Couldn’t update apps"
              description="Your change was not saved. Please try again."
            />
          )}
        </>
      )}
      {disabling && (
        <ConfirmDialog
          title={`Disable ${disabling === "tasks" ? "Tasks" : "CRM"}?`}
          description={
            disabling === "tasks"
              ? "Tasks, Projects, and CRM follow-up tasks will be unavailable to everyone in this organization. Existing projects and tasks are preserved. Enable Tasks again to restore access."
              : "Accounts and deals will be unavailable to everyone in this organization. Existing CRM data is preserved. Contacts and Tasks stay available. Enable CRM again to restore access."
          }
          confirmLabel={`Disable ${disabling === "tasks" ? "Tasks" : "CRM"}`}
          pendingLabel="Disabling"
          pending={mutation.isPending}
          error={mutation.error}
          errorDescription="Couldn’t disable this app. Please try again."
          onConfirm={() => change(disabling, false)}
          onClose={() => {
            setDisabling(null);
            mutation.reset();
          }}
        />
      )}
    </SettingsPanel>
  );
}
