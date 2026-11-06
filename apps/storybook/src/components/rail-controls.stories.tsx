import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { OrganizationSwitcher } from "@startup-os/ui/organizations/organization-switcher";
import { SignOutButton } from "@startup-os/ui/auth/sign-out-button";
import { organizations } from "../fixtures";

const meta = {
  title: "Components/Workspace/Rail controls",
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const switcher = {
  organizationId: "studio",
  name: "Launch Studio",
  organizations,
  onSelect: fn(),
  manageHref: "#workspaces",
};
const rail = (children: React.ReactNode) => (
  <div className="flex w-16 flex-col items-center gap-5 rounded-xl bg-rail py-5 text-rail-foreground shadow-raised">
    {children}
  </div>
);

export const WorkspaceSwitcher: Story = { render: () => <OrganizationSwitcher {...switcher} /> };
export const CompactSwitcher: Story = {
  render: () => rail(<OrganizationSwitcher {...switcher} compact />),
};
export const Switching: Story = {
  render: () => rail(<OrganizationSwitcher {...switcher} compact pending />),
};
export const SwitchError: Story = {
  render: () =>
    rail(
      <OrganizationSwitcher
        {...switcher}
        compact
        error={new Error("Could not switch workspaces.")}
      />,
    ),
};
export const SignOut: Story = { render: () => <SignOutButton onSignOut={fn()} /> };
export const CompactSignOut: Story = {
  render: () => rail(<SignOutButton compact onSignOut={fn()} />),
};
export const SigningOut: Story = {
  render: () => rail(<SignOutButton compact pending onSignOut={fn()} />),
};
export const SignOutError: Story = {
  render: () =>
    rail(<SignOutButton compact onSignOut={fn()} error={new Error("Could not sign out.")} />),
};
