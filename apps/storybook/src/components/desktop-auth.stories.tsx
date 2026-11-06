import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DesktopSignIn } from "@startup-os/ui/auth/desktop-sign-in";
import { BrowserElectronReturn } from "@startup-os/ui/auth/browser-electron-return";

function DesktopAuthPreview({
  returning = false,
  state = "ready",
}: {
  returning?: boolean;
  state?: "ready" | "pending" | "waiting" | "error";
}) {
  const [waiting, setWaiting] = useState(state === "waiting");
  const [retried, setRetried] = useState(false);
  const error = state === "error" && !retried ? new Error("Request failed") : null;
  if (returning)
    return (
      <BrowserElectronReturn
        pending={state === "pending"}
        error={error}
        onContinue={() => setRetried(true)}
      />
    );
  return (
    <DesktopSignIn
      pending={state === "pending"}
      waiting={waiting}
      error={error}
      failed={!!error}
      onSignIn={() => {
        setRetried(true);
        setWaiting(true);
      }}
    />
  );
}

const meta = {
  title: "Components/Auth/Desktop handoff",
  component: DesktopAuthPreview,
} satisfies Meta<typeof DesktopAuthPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SignIn: Story = {};
export const Opening: Story = { args: { state: "pending" } };
export const Waiting: Story = { args: { state: "waiting" } };
export const Failed: Story = { args: { state: "error" } };
export const Return: Story = { args: { returning: true } };
export const Returning: Story = { args: { returning: true, state: "pending" } };
export const ReturnFailed: Story = { args: { returning: true, state: "error" } };
export const DarkSignIn: Story = { globals: { theme: "dark" } };
