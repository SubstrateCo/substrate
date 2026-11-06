import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CreateConversationForm } from "@startup-os/ui/messaging/create-conversation-form";

const meta = {
  title: "Messaging/Components/Create conversation",
  component: CreateConversationForm,
  args: { kind: "channel", onSubmit: fn() },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CreateConversationForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NewChannel: Story = {};
export const CreatingChannel: Story = { args: { pending: true } };
export const NewDirectMessage: Story = { args: { kind: "dm" } };
export const DirectMessageValidation: Story = {
  args: { kind: "dm", error: new Error("Use a group message for more than one recipient.") },
};
export const NewGroup: Story = { args: { kind: "group" } };
export const GroupValidation: Story = {
  args: { kind: "group", error: new Error("Enter at least two recipients for a group message.") },
};
export const CreationError: Story = {
  args: { error: new Error("Your active workspace changed. Reload this page to continue.") },
};
