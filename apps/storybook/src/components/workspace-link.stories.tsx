import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceLinkPrompt } from "@startup-os/ui/workspace/workspace-link-prompt";
import { CopyLink } from "@startup-os/ui/context/copy-link";

function WorkspaceLinkPreview({
  state = "ready",
  copy = false,
}: {
  state?: "ready" | "pending" | "error";
  copy?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  if (copy)
    return (
      <CopyLink
        label="Copy task link"
        onCopy={async () => {
          if (state === "error") throw new Error("Clipboard unavailable");
        }}
      />
    );
  if (opened) return <p role="status">Workspace opened.</p>;
  return (
    <WorkspaceLinkPrompt
      pending={state === "pending"}
      error={state === "error" ? new Error("Request failed") : null}
      onSwitch={() => setOpened(true)}
    />
  );
}

const meta = { title: "Workspace/Links", component: WorkspaceLinkPreview } satisfies Meta<
  typeof WorkspaceLinkPreview
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Switch: Story = {};
export const Switching: Story = { args: { state: "pending" } };
export const SwitchFailed: Story = { args: { state: "error" } };
export const Copy: Story = { args: { copy: true } };
export const CopyFailed: Story = { args: { copy: true, state: "error" } };
export const Dark: Story = { globals: { theme: "dark" } };
