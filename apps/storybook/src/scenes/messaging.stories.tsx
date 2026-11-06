import type { Meta, StoryObj } from "@storybook/react-vite";
import { MessagingScene } from "./messaging-scene";
import { userEvent, within } from "storybook/test";

const meta = { title: "Messaging/Scenes/Workspace", component: MessagingScene } satisfies Meta<
  typeof MessagingScene
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PublicChannel: Story = {};
export const ReferencesInChannel: Story = { args: { referencesDemo: true } };
export const ReferencesInThread: Story = { args: { referencesDemo: true, threadState: "ready" } };
export const ReferencePickerOpen: Story = {
  args: { referencesDemo: true },
  play: async ({ canvasElement }) => {
    await userEvent.type(
      within(canvasElement).getByRole("textbox", { name: "Message #general" }),
      "@",
    );
  },
};
export const DarkReferences: Story = { args: { referencesDemo: true }, globals: { theme: "dark" } };
export const TaskInChannel: Story = { args: { linkedTask: "channel" } };
export const TaskInThread: Story = { args: { linkedTask: "thread", threadState: "ready" } };
export const DarkTaskInChannel: Story = {
  args: { linkedTask: "channel" },
  globals: { theme: "dark" },
};
export const MobileTaskInThread: Story = {
  args: { linkedTask: "thread", threadState: "ready" },
  globals: { viewport: { value: "mobile" } },
};
export const PrivateChannel: Story = { args: { conversationId: "launch" } };
export const DirectMessage: Story = { args: { conversationId: "alex" } };
export const GroupMessage: Story = { args: { conversationId: "group" } };
export const UnnamedGroup: Story = { args: { conversationId: "unnamed" } };
export const MemberWorkspace: Story = { args: { member: true } };
export const EmptyWorkspace: Story = { args: { state: "empty" } };
export const LoadingConversations: Story = { args: { state: "loading" } };
export const ConversationListError: Story = { args: { state: "error" } };
export const StaleWorkspaceTab: Story = { args: { state: "stale" } };
export const RevokedMembership: Story = { args: { state: "revoked" } };
export const EmptyChannel: Story = { args: { messageState: "empty" } };
export const EmptyDirectMessage: Story = {
  args: { conversationId: "alex", messageState: "empty" },
};
export const LoadingMessages: Story = { args: { messageState: "loading" } };
export const MessageAccessError: Story = { args: { messageState: "error" } };
export const ThreadOpen: Story = { args: { threadState: "ready" } };
export const EmptyThread: Story = { args: { threadState: "empty" } };
export const LoadingThread: Story = { args: { threadState: "loading" } };
export const ThreadError: Story = { args: { threadState: "error" } };
export const SendingMessage: Story = { args: { composerState: "pending" } };
export const SendError: Story = { args: { composerState: "error" } };
export const AddPeople: Story = { args: { membersOpen: true } };
export const CreateChannel: Story = { args: { creatingKind: "channel" } };
export const CreateDirectMessage: Story = { args: { creatingKind: "dm" } };
export const CreateGroup: Story = { args: { creatingKind: "group" } };
export const LongContent: Story = { args: { longContent: true } };
export const Mobile320: Story = { globals: { viewport: { value: "narrow" } } };
export const Mobile390: Story = { globals: { viewport: { value: "mobile" } } };
export const MobileSidebar: Story = {
  args: { mobileSidebarOpen: true },
  globals: { viewport: { value: "mobile" } },
};
export const MobileThread: Story = {
  args: { threadState: "ready" },
  globals: { viewport: { value: "mobile" } },
};
export const DarkWorkspace: Story = { globals: { theme: "dark" } };
export const DarkLoading: Story = { args: { messageState: "loading" }, globals: { theme: "dark" } };
export const DarkError: Story = { args: { messageState: "error" }, globals: { theme: "dark" } };
export const MobileSendError: Story = {
  args: { composerState: "error" },
  globals: { viewport: { value: "narrow" } },
};
