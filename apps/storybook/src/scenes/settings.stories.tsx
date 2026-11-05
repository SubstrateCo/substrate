import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { WorkspaceShell } from "@startup-os/ui/workspace/workspace-shell";
import { WorkspaceSettings } from "@startup-os/ui/workspace/workspace-settings";
import {
  InvitationManager,
  type InvitationListItem,
} from "@startup-os/ui/organizations/invitation-manager";
import { OrganizationSwitcher } from "@startup-os/ui/organizations/organization-switcher";
import { SignOutButton } from "@startup-os/ui/auth/sign-out-button";
import { invitations, organizations } from "../fixtures";

function SettingsScene({
  owner = true,
  state = "ready",
}: {
  owner?: boolean;
  state?: "ready" | "empty" | "loading" | "error" | "sending" | "canceling" | "sent" | "canceled";
}) {
  const [items, setItems] = useState(state === "empty" ? [] : invitations);
  const [message, setMessage] = useState<string | undefined>(
    state === "sent"
      ? "Invitation email sent."
      : state === "canceled"
        ? "Invitation canceled."
        : undefined,
  );
  return (
    <WorkspaceShell
      name="Taylor Kim"
      view="settings"
      showSettings
      onViewChange={fn()}
      switcher={
        <OrganizationSwitcher
          organizationId="studio"
          name="Launch Studio"
          compact
          organizations={organizations}
          onSelect={fn()}
          manageHref="#workspaces"
        />
      }
      signOut={<SignOutButton compact onSignOut={fn()} />}
    >
      <WorkspaceSettings>
        {owner && (
          <InvitationManager
            invitations={state === "loading" || state === "error" ? undefined : items}
            loading={state === "loading"}
            sending={state === "sending"}
            canceling={state === "canceling"}
            error={state === "error" ? new Error("Could not load invitations.") : null}
            failed={state === "error"}
            message={message}
            onRetry={fn()}
            onInvite={(email, role, resend) => {
              if (!resend)
                setItems([
                  ...items,
                  {
                    id: `new-${items.length}`,
                    email,
                    role,
                    status: "pending",
                    expired: false,
                  } satisfies InvitationListItem,
                ]);
              setMessage("Invitation email sent.");
            }}
            onCancel={(id) => {
              setItems(
                items.map((item) => (item.id === id ? { ...item, status: "canceled" } : item)),
              );
              setMessage("Invitation canceled.");
            }}
          />
        )}
      </WorkspaceSettings>
    </WorkspaceShell>
  );
}

const meta = { title: "Scenes/Settings", component: SettingsScene } satisfies Meta<
  typeof SettingsScene
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Owner: Story = {};
export const Admin: Story = { args: { owner: false } };
export const NoInvitations: Story = { args: { state: "empty" } };
export const Loading: Story = { args: { state: "loading" } };
export const LoadError: Story = { args: { state: "error" } };
export const Sending: Story = { args: { state: "sending" } };
export const Canceling: Story = { args: { state: "canceling" } };
export const InvitationSent: Story = { args: { state: "sent" } };
export const InvitationCanceled: Story = { args: { state: "canceled" } };
export const Mobile: Story = { globals: { viewport: { value: "mobile" } } };
