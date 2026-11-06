import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "@startup-os/ui/primitives/textarea";
import { Label } from "@startup-os/ui/primitives/label";

const meta = {
  title: "Primitives/Forms/Textarea",
  component: Textarea,
  args: { id: "message", placeholder: "Write a message…" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl space-y-2 p-8">
        <Label htmlFor="message">Message</Label>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true, defaultValue: "Sending…" } };
export const Invalid: Story = { args: { "aria-invalid": true, defaultValue: "Keep my draft" } };
