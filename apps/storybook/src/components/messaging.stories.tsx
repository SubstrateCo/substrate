import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Composer } from "@startup-os/ui/messaging/composer";
import { MessageItem } from "@startup-os/ui/messaging/message-item";
import { MessageMarkdown } from "@startup-os/ui/messaging/message-markdown";
import { EmojiPicker } from "@startup-os/ui/messaging/emoji-picker";
import { AddMembersForm } from "@startup-os/ui/messaging/add-members-form";
import { CreateConversationForm } from "@startup-os/ui/messaging/create-conversation-form";
import { ConversationSidebar } from "@startup-os/ui/messaging/conversation-sidebar";
import { messages, conversations } from "../fixtures";

const meta = {
  title: "Components/Messaging",
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="min-w-0 max-w-3xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Message: Story = {
  render: () => <MessageItem message={messages[0]} onReact={fn()} onThread={fn()} />,
};
export const UnknownAuthor: Story = {
  render: () => <MessageItem message={{ ...messages[0], authorName: "" }} onReact={fn()} />,
};
export const ReactionPending: Story = {
  render: () => <MessageItem message={messages[0]} onReact={fn()} pending />,
};
export const ReactionError: Story = {
  render: () => (
    <MessageItem
      message={messages[0]}
      onReact={fn()}
      error={new Error("Could not update the reaction.")}
    />
  ),
};
export const Markdown: Story = {
  render: () => (
    <div className="min-w-0 rounded-xl border bg-card p-6 shadow-raised">
      <MessageMarkdown
        body={
          "# A calmer place to work\n\nThe **launch plan** is ready. Keep everything _connected_ with [your workspace](https://example.com).\n\n## What’s next\n\n- Review the design\n  - Check light and dark surfaces\n- Share feedback with the team\n\n1. Build something useful\n2. Ship it together\n\n> Good work starts with a little clarity.\n\nUse `workspace.send()` to share an update.\n\n```ts\nconst launch = { status: 'ready', team: 'everyone' };\nawait workspace.send(launch);\n```\n\n| Area | Status |\n| --- | --- |\n| Design | Ready for review |\n| Engineering | In progress |\n\n- [x] Gather feedback\n- [ ] Ship the update\n\n---\n\n### A small detail\n\n~~More switching.~~ More doing."
        }
      />
    </div>
  ),
};
export const DarkMarkdown: Story = { ...Markdown, globals: { theme: "dark" } };
export const SafeMarkdown: Story = {
  render: () => (
    <MessageMarkdown
      body={
        '[Safe link](https://example.com)\n\n![Launch plan](https://example.com/tracker.png)\n\n[Unsafe link](javascript:alert(1))\n\n<img src=x onerror="alert(1)"><script>alert(1)</script>'
      }
    />
  ),
};
export const EmptyComposer: Story = {
  render: () => <Composer label="Message #general" onSend={fn()} />,
};
export const DraftComposer: Story = {
  render: () => (
    <Composer label="Message #general" defaultValue="Let's **ship** the launch 🚀" onSend={fn()} />
  ),
};
export const SendingComposer: Story = {
  render: () => (
    <Composer label="Message #general" defaultValue="Sending this message" pending onSend={fn()} />
  ),
};
export const FailedComposer: Story = {
  render: () => (
    <Composer
      label="Message #general"
      defaultValue="Keep my draft"
      error={new Error("Message could not be sent.")}
      onSend={fn()}
    />
  ),
};
export const Emoji: Story = { render: () => <EmojiPicker onSelect={fn()} /> };
export const DisabledEmoji: Story = { render: () => <EmojiPicker onSelect={fn()} disabled /> };
export const Sidebar: Story = {
  render: () => (
    <div className="flex h-175">
      <ConversationSidebar
        workspaceName="Launch Studio"
        conversations={conversations}
        selectedId="general"
        mobileOpen
        onSelect={fn()}
        onCreate={fn()}
      />
    </div>
  ),
};
export const AddPeople: Story = { render: () => <AddMembersForm onSubmit={fn()} onClose={fn()} /> };
export const AddingPeople: Story = {
  render: () => <AddMembersForm pending onSubmit={fn()} onClose={fn()} />,
};
export const AddPeopleError: Story = {
  render: () => (
    <AddMembersForm
      error={new Error("Enter complete email addresses, separated by commas.")}
      onSubmit={fn()}
      onClose={fn()}
    />
  ),
};
export const NewChannel: Story = {
  render: () => <CreateConversationForm kind="channel" onSubmit={fn()} onClose={fn()} />,
};
export const CreatingChannel: Story = {
  render: () => <CreateConversationForm kind="channel" pending onSubmit={fn()} onClose={fn()} />,
};
export const NewDirectMessage: Story = {
  render: () => <CreateConversationForm kind="dm" onSubmit={fn()} onClose={fn()} />,
};
export const DirectMessageValidation: Story = {
  render: () => (
    <CreateConversationForm
      kind="dm"
      error={new Error("Use a group message for more than one recipient.")}
      onSubmit={fn()}
      onClose={fn()}
    />
  ),
};
export const NewGroup: Story = {
  render: () => <CreateConversationForm kind="group" onSubmit={fn()} onClose={fn()} />,
};
export const GroupValidation: Story = {
  render: () => (
    <CreateConversationForm
      kind="group"
      error={new Error("Enter at least two recipients for a group message.")}
      onSubmit={fn()}
      onClose={fn()}
    />
  ),
};
export const CreationError: Story = {
  render: () => (
    <CreateConversationForm
      kind="channel"
      error={new Error("Your active workspace changed. Reload this page to continue.")}
      onSubmit={fn()}
      onClose={fn()}
    />
  ),
};
