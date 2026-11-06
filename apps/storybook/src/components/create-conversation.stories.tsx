import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CreateConversationForm } from "@startup-os/ui/messaging/create-conversation-form";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@startup-os/ui/primitives/select";
import { Button } from "@startup-os/ui/primitives/button";

const meta = {
  title: "Messaging/Components/Create conversation",
  component: CreateConversationForm,
  args: { kind: "channel", onSubmit: fn(), onCancel: fn() },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CreateConversationForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NewChannel: Story = {};
export const CreatingChannel: Story = { args: { pending: true } };
export const NewDirectMessage: Story = { args: { kind: "dm" } };
export const DirectMessageValidation: Story = {
  args: { kind: "dm", error: new Error("Use a group message for more than one recipient.") },
};
export const NewGroup: Story = { args: { kind: "group" } };
export const GroupValidation: Story = {
  args: { kind: "group", error: new Error("Enter at least two recipients for a group message.") },
};
export const CreationError: Story = {
  args: { error: new Error("Your active workspace changed. Reload this page to continue.") },
};

function NestedControl() {
  const [cancelled, setCancelled] = useState(false);
  if (cancelled) return <p role="status">Creation cancelled without submitting</p>;
  return (
    <CreateConversationForm
      kind="channel"
      onSubmit={() => {
        throw new Error("The nested-control workflow must not submit");
      }}
      onCancel={() => setCancelled(true)}
    >
      <Select defaultValue="launch">
        <SelectTrigger aria-label="Review label">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="launch">Launch</SelectItem>
          <SelectItem value="general">General</SelectItem>
        </SelectContent>
      </Select>
    </CreateConversationForm>
  );
}
export const NestedControlEscape: Story = { render: () => <NestedControl /> };

function PendingCreation() {
  const [phase, setPhase] = useState<"ready" | "pending" | "error" | "cancelled">("ready");
  const [attempts, setAttempts] = useState(0);
  if (phase === "cancelled") return <p role="status">Creation cancelled</p>;
  return (
    <>
      <p role="status">Creation attempts: {attempts}</p>
      <CreateConversationForm
        kind="channel"
        pending={phase === "pending"}
        error={phase === "error" ? new Error("Could not create channel") : null}
        onSubmit={() => {
          setAttempts((previous) => previous + 1);
          setPhase("pending");
        }}
        onCancel={() => setPhase("cancelled")}
      />
      <Button disabled={phase !== "pending"} onClick={() => setPhase("error")}>
        Fail creation
      </Button>
    </>
  );
}
export const PendingCreationRetry: Story = { render: () => <PendingCreation /> };
