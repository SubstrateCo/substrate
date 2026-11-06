import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MessageWork } from "@startup-os/ui/messaging/message-work";

const meta = {
  title: "Messaging/Components/Linked work",
  component: MessageWork,
  args: {
    links: [
      {
        entityId: "onboarding",
        entityType: "task",
        title: "Review the onboarding flow",
        href: "/iframe.html?id=projects-scenes-tasks--project&viewMode=story",
        statusName: "In progress",
        purpose: "source",
        canRemove: true,
      },
    ],
    onRemove: fn(),
    onRetry: fn(),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageWork>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CreatedTask: Story = {};
export const LinkedProject: Story = {
  args: {
    links: [
      {
        entityId: "launch",
        entityType: "project",
        title: "Workspace launch",
        href: "/iframe.html?id=projects-scenes-tasks--project&viewMode=story",
        purpose: "related",
        canRemove: false,
      },
    ],
  },
};
export const Loading: Story = { args: { links: [], loading: true } };
export const LoadError: Story = { args: { links: [], error: new Error("Request failed") } };
export const RefreshError: Story = { args: { error: new Error("Request failed") } };
export const UnlinkPending: Story = { args: { removing: true } };
export const UnlinkError: Story = { args: { removeError: new Error("Request failed") } };
export const DarkTask: Story = { globals: { theme: "dark" } };
