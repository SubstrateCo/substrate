import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AddMembersForm } from "@startup-os/ui/messaging/add-members-form";

const meta = {
  title: "Messaging/Components/Add members",
  component: AddMembersForm,
  args: { onSubmit: fn(), onClose: fn() },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AddMembersForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Pending: Story = { args: { pending: true } };
export const Failed: Story = {
  args: { error: new Error("Enter complete email addresses, separated by commas.") },
};
