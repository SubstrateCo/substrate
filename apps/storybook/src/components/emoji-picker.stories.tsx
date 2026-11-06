import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EmojiPicker } from "@startup-os/ui/messaging/emoji-picker";

const meta = {
  title: "Messaging/Components/Emoji picker",
  component: EmojiPicker,
  args: { onSelect: fn() },
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EmojiPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
