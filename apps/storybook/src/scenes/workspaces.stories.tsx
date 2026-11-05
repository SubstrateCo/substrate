import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { OrganizationSelection } from "@startup-os/ui/organizations/organization-selection";
import { CreateOrganizationForm } from "@startup-os/ui/organizations/create-organization-form";
import { AcceptInvitationScreen } from "@startup-os/ui/organizations/accept-invitation-screen";
import { SignOutButton } from "@startup-os/ui/auth/sign-out-button";
import { organizations } from "../fixtures";

const meta = { title: "Scenes/Workspaces" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const selection = {
  onRetry: fn(),
  onSelect: fn(),
  signOut: <SignOutButton onSignOut={fn()} />,
  createForm: <CreateOrganizationForm onSubmit={fn()} />,
};
const acceptance = {
  invitation: { organizationName: "Launch Studio", role: "member", email: "taylor@example.com" },
  available: true,
  onAccept: fn(),
  signOut: <SignOutButton onSignOut={fn()} />,
  workspacesHref: "#workspaces",
};

function InteractiveSelection() {
  const [items, setItems] = useState(organizations);
  const [selected, setSelected] = useState<string>();
  return (
    <OrganizationSelection
      {...selection}
      organizations={items}
      onSelect={setSelected}
      error={
        selected
          ? new Error(`Preview selected: ${items.find((item) => item.id === selected)?.name}`)
          : null
      }
      createForm={
        <CreateOrganizationForm
          onSubmit={(form) => {
            const name = form.get("name");
            if (name === null || name instanceof File) return;
            setItems([...items, { id: `new-${items.length}`, name }]);
          }}
        />
      }
    />
  );
}

export const Populated: Story = { render: () => <InteractiveSelection /> };
export const NoWorkspaces: Story = {
  render: () => <OrganizationSelection {...selection} organizations={[]} />,
};
export const Loading: Story = { render: () => <OrganizationSelection {...selection} loading /> };
export const LoadError: Story = {
  render: () => (
    <OrganizationSelection
      {...selection}
      failed
      error={new Error("Could not load your workspaces.")}
    />
  ),
};
export const Switching: Story = {
  render: () => <OrganizationSelection {...selection} organizations={organizations} pending />,
};
export const CreatingWorkspace: Story = {
  render: () => (
    <OrganizationSelection
      {...selection}
      organizations={[]}
      createForm={<CreateOrganizationForm pending onSubmit={fn()} />}
    />
  ),
};
export const CreateWorkspaceError: Story = {
  render: () => (
    <OrganizationSelection
      {...selection}
      organizations={organizations}
      createForm={
        <CreateOrganizationForm
          onSubmit={fn()}
          error={new Error("This workspace slug is already taken.")}
        />
      }
    />
  ),
};
export const AcceptInvitation: Story = { render: () => <AcceptInvitationScreen {...acceptance} /> };
export const LoadingInvitation: Story = {
  render: () => <AcceptInvitationScreen {...acceptance} invitation={undefined} loading />,
};
export const JoiningWorkspace: Story = {
  render: () => <AcceptInvitationScreen {...acceptance} pending />,
};
export const ExpiredInvitation: Story = {
  render: () => <AcceptInvitationScreen {...acceptance} available={false} />,
};
export const CanceledInvitation: Story = {
  render: () => <AcceptInvitationScreen {...acceptance} available={false} />,
};
export const AcceptedInvitation: Story = {
  render: () => <AcceptInvitationScreen {...acceptance} available={false} />,
};
export const WrongInvitedEmail: Story = {
  render: () => (
    <AcceptInvitationScreen
      {...acceptance}
      invitation={undefined}
      available={false}
      failed
      error={new Error("Invitation not found.")}
    />
  ),
};
export const AcceptanceError: Story = {
  render: () => (
    <AcceptInvitationScreen
      {...acceptance}
      error={new Error("Could not accept the invitation. Please try again.")}
    />
  ),
};
