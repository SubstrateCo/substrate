import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "@startup-os/ui/primitives/input";
import { Label } from "@startup-os/ui/primitives/label";

const meta = {
  title: "Primitives/Forms/Input",
  component: Input,
  args: { id: "workspace-name", placeholder: "Launch Studio" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm space-y-2 p-8">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true, defaultValue: "Launch Studio" } };
export const Invalid: Story = { args: { "aria-invalid": true, defaultValue: "Invalid value" } };
