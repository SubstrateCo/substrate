import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeSwitcher } from "@startup-os/ui/theme/theme-switcher";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@startup-os/ui/primitives/card";
import { Button } from "@startup-os/ui/primitives/button";

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
        ["Surface", "bg-surface text-foreground"],
        ["Sidebar", "bg-sidebar text-sidebar-foreground"],
        ["Success", "bg-success text-background"],
        ["Destructive", "bg-destructive text-white"],
      ].map(([name, className]) => (
        <div key={name} className={`flex h-28 items-end rounded-lg border p-4 ${className}`}>
          {name}
        </div>
      ))}
    </div>
  ),
};

export const Surfaces: Story = {
  render: () => (
    <div className="mx-auto max-w-4xl space-y-8 p-6 sm:p-12">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">A little depth. A lot of clarity.</h1>
        <ThemeSwitcher />
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        {[
          ["Surface", "shadow-surface"],
          ["Raised", "shadow-raised"],
          ["Floating", "shadow-floating"],
        ].map(([name, shadow]) => (
          <div key={name} className={`space-y-3 rounded-xl border bg-card p-6 ${shadow}`}>
            <div className="size-9 rounded-lg border bg-accent shadow-surface" />
            <h2 className="font-medium">{name}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Quiet boundaries and soft light keep the focus on your work.
            </p>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardDescription>YOUR WORKSPACE, IN SYNC</CardDescription>
          <CardTitle size="lg">Make space for your best work.</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button>Start a conversation</Button>
            <Button variant="outline">Explore workspace</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  ),
};
export const Appearance: Story = {
  render: () => (
    <div className="flex min-h-screen items-center justify-center">
      <ThemeSwitcher />
    </div>
  ),
};
export const DarkSurfaces: Story = { ...Surfaces, globals: { theme: "dark" } };
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
