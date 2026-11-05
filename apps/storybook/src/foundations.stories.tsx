import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = { title: "Foundations/Theme" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Colors: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 p-8 sm:grid-cols-4">
      {[
        ["Background", "bg-background text-foreground"],
        ["Foreground", "bg-foreground text-background"],
        ["Primary", "bg-primary text-primary-foreground"],
        ["Secondary", "bg-secondary text-secondary-foreground"],
        ["Muted", "bg-muted text-muted-foreground"],
        ["Accent", "bg-accent text-accent-foreground"],
        ["Card", "bg-card text-card-foreground"],
        ["Destructive", "bg-destructive text-white"],
      ].map(([name, className]) => (
        <div key={name} className={`flex h-28 items-end rounded-lg border p-4 ${className}`}>
          {name}
        </div>
      ))}
    </div>
  ),
};
export const Typography: Story = {
  render: () => (
    <div className="space-y-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">A shared home for your team</h1>
      <h2 className="text-2xl font-semibold tracking-tight">Workspace heading</h2>
      <h3 className="text-lg font-semibold">Conversation heading</h3>
      <p className="text-sm leading-relaxed">
        Messages, docs, tasks, agents, and CRM in one workspace.
      </p>
      <p className="text-xs text-muted-foreground">Supporting text and timestamps</p>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Section label
      </p>
    </div>
  ),
};
