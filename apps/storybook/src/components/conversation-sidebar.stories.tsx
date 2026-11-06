import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ConversationSidebar } from "@startup-os/ui/messaging/conversation-sidebar";
import { conversations } from "../fixtures";

const meta = {
  title: "Messaging/Components/Conversation sidebar",
  component: ConversationSidebar,
  args: { conversations, selectedId: "general", mobileOpen: true, onSelect: fn(), onCreate: fn() },
  decorators: [
    (Story) => (
      <div className="flex h-175 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConversationSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const PartnerChannels: Story = {
  args: {
    conversations: [
      ...conversations,
      {
        id: "partner-launch",
        kind: "channel",
        name: "Partner launch",
        private: true,
        partner: true,
      },
    ],
  },
};
