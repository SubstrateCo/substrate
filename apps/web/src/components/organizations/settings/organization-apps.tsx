import type { AppId, OptionalAppId } from "@substrate/contracts/apps";
import { appScope, organizationAppIds, userAppIds } from "@substrate/contracts/apps";
import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { AppAgentSupportFooter, type AppAgentSupport } from "./app-agent-support";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Tag } from "@/components/feedback/tag";
import { SettingsPanel } from "@/components/layout/settings-page";
import { SettingsSection } from "@/components/layout/settings-section";
import { Item, ItemContent, ItemHeader, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { workspaceApps } from "@/components/workspace/workspace-apps";
import {
  organizationAppsOptions,
  useUpdateOrganizationApps,
  useUpdatePersonalApp,
} from "@/queries/organizations/apps";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";

const catalog = [
  {
    id: "messages",
    description: "Keep conversations, channels, and shared context together.",
    required: true,
    agentSupport: { mcp: true, skill: "substrate-messaging" },
  },
  {
    id: "agents",
    description: "Work with your agents, review requests, and manage their home desktops.",
    required: true,
    agentSupport: { mcp: false },
  },
  {
    id: "tasks",
    description:
      "Plan projects, assign tasks, and track work. Includes Projects and CRM follow-up tasks.",
    required: false,
    agentSupport: { mcp: true, skill: "substrate-tasks" },
  },
  {
    id: "crm",
    description:
      "Manage accounts, deals, and customer relationships. Enable independently of Tasks.",
    required: false,
    agentSupport: { mcp: true, skill: "substrate-crm" },
  },
  {
    id: "calendar",
    description:
      "Members sync their calendars read-only. Meetings with outside attendees can create contacts and interactions.",
    required: false,
    agentSupport: { mcp: false },
  },
  {
    id: "inbox",
    description:
      "Read and manage Gmail on this device. In a private DM, your agent can use its configured model to answer questions about your inbox.",
    required: false,
    agentSupport: { mcp: "read-only", skill: "substrate-inbox" },
  },
] as const satisfies ReadonlyArray<{
  id: AppId;
  description: string;
  required: boolean;
  agentSupport: AppAgentSupport;
}>;

const disableCopy = {
  tasks: {
    label: "Tasks",
    description:
      "Tasks, Projects, and CRM follow-up tasks will be unavailable to everyone in this organization. Existing projects and tasks are preserved. Enable Tasks again to restore access.",
  },
  crm: {
    label: "CRM",
    description:
      "Accounts and deals will be unavailable to everyone in this organization. Existing CRM data is preserved. Contacts and Tasks stay available. Enable CRM again to restore access.",
  },
  calendar: {
    label: "Calendar",
    description:
      "Calendar and calendar settings will be unavailable to everyone in this organization. Contacts and interactions from past meetings are preserved. Enable Calendar again to restore access.",
  },
  inbox: {
    label: "Inbox",
    description:
      "Inbox will be hidden for you, your Gmail sync will pause, and your agents will lose Inbox access in this workspace. Your connected mailboxes and cached mail stay on your devices. Other members are not affected.",
  },
} as const satisfies Record<OptionalAppId, { label: string; description: string }>;

export function OrganizationApps({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const settings = useQuery(organizationAppsOptions(organizationId, userId));
  const organization = useQuery(currentOrganizationQueryOptions(organizationId));
  const organizationMutation = useUpdateOrganizationApps(organizationId, userId);
  const personalMutation = useUpdatePersonalApp(organizationId, userId);
  const pending = organizationMutation.isPending || personalMutation.isPending;
  const error = personalMutation.error ?? organizationMutation.error;
  const reset = () => {
    personalMutation.reset();
    organizationMutation.reset();
  };
  const [disabling, setDisabling] = useState<OptionalAppId | null>(null);
  const canManage = organizationSettingsAccess(organization.data?.role).allowed;
  const change = (app: AppId, enabled: boolean) => {
    if (!settings.data) return;
    const personal = userAppIds.find((id) => id === app);
    if (personal) {
      personalMutation.mutate(
        { appId: personal, enabled },
        { onSuccess: () => setDisabling(null) },
      );
      return;
    }
    if (!canManage) return;
    const current = settings.data.enabledApps;
    const next = organizationAppIds.filter((item) =>
      item === app ? enabled : current.includes(item),
    );
    organizationMutation.mutate(next, { onSuccess: () => setDisabling(null) });
  };
  return (
    <SettingsPanel
      title="Apps"
      description="Workspace apps apply to everyone. Personal apps change only for you in this workspace."
    >
      {settings.isPending && <LoadingState label="Loading apps" />}
      {settings.error && (
        <ErrorState
          title="Couldn’t load apps"
          description="Try again to view this organization’s apps."
          onRetry={() => void settings.refetch()}
        />
      )}
      {settings.data && !settings.error && (
        <>
          {(["organization", "user"] as const).map((scope) => (
            <SettingsSection
              key={scope}
              title={scope === "user" ? "Personal apps" : "Workspace apps"}
              description={
                scope === "user"
                  ? "Only you can enable these apps for yourself. Other members are not affected."
                  : "Owners and admins manage these apps for everyone in this workspace."
              }
            >
              <div className="@container">
                <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
                  {catalog.flatMap((entry) => {
                    if (appScope(entry.id) !== scope) return [];
                    const app = workspaceApps.find((item) => item.id === entry.id)!;
                    const Icon = app.icon;
                    const enabled = settings.data.enabledApps.includes(entry.id);
                    const canChange = scope === "user" || canManage;
                    return (
                      <Item
                        key={entry.id}
                        variant="outline"
                        asChild
                        className="h-full flex-col flex-nowrap items-stretch"
                      >
                        <section aria-label={app.label}>
                          <ItemHeader className="basis-auto flex-wrap">
                            <div className="flex shrink-0 items-center gap-3">
                              <ItemMedia>
                                <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                                  <Icon className="size-5" aria-hidden />
                                </div>
                              </ItemMedia>
                              <ItemTitle>
                                {!entry.required && canChange ? (
                                  <Label htmlFor={`organization-app-${entry.id}`}>
                                    {app.label}
                                  </Label>
                                ) : (
                                  app.label
                                )}
                              </ItemTitle>
                            </div>
                            {entry.required && <Tag>Required</Tag>}
                            {!entry.required && canChange && (
                              <Switch
                                id={`organization-app-${entry.id}`}
                                checked={enabled}
                                disabled={pending}
                                onCheckedChange={(checked) => {
                                  reset();
                                  if (!checked) setDisabling(entry.id);
                                  else change(entry.id, true);
                                }}
                              />
                            )}
                            {!entry.required && !canChange && (
                              <Tag>{enabled ? "Enabled" : "Disabled"}</Tag>
                            )}
                          </ItemHeader>
                          <ItemContent>
                            {/* ItemDescription clamps to two lines; these descriptions run longer. */}
                            <p className="text-sm text-muted-foreground">{entry.description}</p>
                          </ItemContent>
                          <AppAgentSupportFooter app={app.label} support={entry.agentSupport} />
                        </section>
                      </Item>
                    );
                  })}
                </div>
              </div>
            </SettingsSection>
          ))}
          {error && !disabling && (
            <ErrorState
              title="Couldn’t update apps"
              description="Your change was not saved. Please try again."
            />
          )}
        </>
      )}
      {disabling && (
        <ConfirmDialog
          title={`Disable ${disableCopy[disabling].label}?`}
          description={disableCopy[disabling].description}
          confirmLabel={`Disable ${disableCopy[disabling].label}`}
          pending={pending}
          error={error}
          errorDescription="Couldn’t disable this app. Please try again."
          onConfirm={() => change(disabling, false)}
          onClose={() => {
            setDisabling(null);
            reset();
          }}
        />
      )}
    </SettingsPanel>
  );
}
