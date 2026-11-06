import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MessageItem } from "@startup-os/ui/messaging/message-item";
import { messages } from "../fixtures";

const meta = {
  title: "Messaging/Components/Message item",
  component: MessageItem,
  args: { message: messages[0], onReact: fn(), onThread: fn() },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageItem>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const UnknownAuthor: Story = { args: { message: { ...messages[0], authorName: "" } } };
export const ReactionPending: Story = { args: { pending: true } };
export const ReactionError: Story = {
  args: { error: new Error("Could not update the reaction.") },
};
