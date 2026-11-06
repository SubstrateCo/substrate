import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotificationList } from "@startup-os/ui/context/notification-list";

function NotificationsPreview({
  state = "ready",
}: {
  state?:
    | "ready"
    | "loading"
    | "error"
    | "empty"
    | "refresh-error"
    | "unavailable"
    | "pending"
    | "action-error";
}) {
  const [read, setRead] = useState<string[]>([]);
  const [retried, setRetried] = useState(false);
  const [closed, setClosed] = useState(false);
  const failed = !retried && ["error", "refresh-error", "unavailable"].includes(state);
  const error = failed
    ? Object.assign(new Error("Request failed"), { status: state === "unavailable" ? 403 : 503 })
    : null;
  const items =
    state === "loading" || state === "empty" || (failed && state === "error")
      ? []
      : [
          {
            id: "assignment",
            title: "Ship the launch",
            href: "#task",
            kind: "assignment",
            read: read.includes("assignment"),
          },
          {
            id: "mention",
            title: "Alex mentioned you in Launch team",
            href: "#message",
            kind: "mention",
            read: read.includes("mention"),
          },
        ];
  if (closed) return <p role="status">Notifications closed.</p>;
  return (
    <NotificationList
      items={items}
      loading={state === "loading"}
      error={error}
      pendingId={state === "pending" ? "assignment" : undefined}
      actionError={state === "action-error" ? new Error("Request failed") : null}
      onRetry={() => setRetried(true)}
      onRead={(id) => setRead([...read, id])}
      onOpen={(item, event) => {
        event.preventDefault();
        setRead([...read, item.id]);
      }}
      onClose={() => setClosed(true)}
    />
  );
}

const meta = { title: "Workspace/Notifications", component: NotificationsPreview } satisfies Meta<
  typeof NotificationsPreview
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Loading: Story = { args: { state: "loading" } };
export const LoadError: Story = { args: { state: "error" } };
export const Empty: Story = { args: { state: "empty" } };
export const RefreshError: Story = { args: { state: "refresh-error" } };
export const Unavailable: Story = { args: { state: "unavailable" } };
export const Pending: Story = { args: { state: "pending" } };
export const ActionError: Story = { args: { state: "action-error" } };
export const Dark: Story = { globals: { theme: "dark" } };
