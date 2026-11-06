import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppearanceControl } from "@startup-os/ui/theme/appearance-control";
import { Input } from "@startup-os/ui/primitives/input";
import { FormMessage } from "@startup-os/ui/auth/form-message";

const meta = { title: "Foundations/Review controls" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const InlineError: Story = {
  render: () => (
    <div className="m-6 max-w-sm">
      <FormMessage error={new Error("Internal service details must not be exposed")} />
    </div>
  ),
};

export const InputBoundary: Story = {
  render: () => (
    <div className="m-6 max-w-sm rounded-lg bg-card p-6">
      <label htmlFor="boundary-input">Workspace name</label>
      <Input id="boundary-input" defaultValue="Launch Studio" />
    </div>
  ),
};

export const Appearance: Story = {
  render: () => (
    <div className="max-w-sm p-4">
      <AppearanceControl />
    </div>
  ),
};
