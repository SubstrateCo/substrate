import type { Meta, StoryObj } from "@storybook/react-vite";
import { MessageMarkdown } from "@startup-os/ui/messaging/message-markdown";

const meta = {
  title: "Messaging/Components/Message body",
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
