import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Composer } from "@startup-os/ui/messaging/composer";

const meta = {
  title: "Messaging/Components/Composer",
  component: Composer,
  args: { label: "Message #general", onSend: fn() },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Composer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Draft: Story = { args: { defaultValue: "Let's **ship** the launch 🚀" } };
export const Sending: Story = { args: { defaultValue: "Sending this message", pending: true } };
export const Failed: Story = {
  args: { defaultValue: "Keep my draft", error: new Error("Message could not be sent.") },
};
