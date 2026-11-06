import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { OrganizationSelectionActions } from "@startup-os/ui/organizations/organization-selection-actions";
import { SignOutButton } from "@startup-os/ui/auth/sign-out-button";
import { ThemeControl } from "@startup-os/ui/theme/theme-control";

const meta = { title: "Components/Production workspace controls" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function Controls() {
  const [pending, setPending] = useState(false);
  return (
    <div className="p-4 pt-24">
      <ThemeControl />
      <OrganizationSelectionActions
        invitationsHref="#invitations"
        signOut={<SignOutButton pending={pending} onSignOut={() => setPending(true)} />}
      />
    </div>
  );
}
export const SelectionAndTheme: Story = { render: () => <Controls /> };
