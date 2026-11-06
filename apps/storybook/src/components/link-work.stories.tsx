import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkMessageWork } from "@startup-os/ui/context/link-message-work";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@startup-os/ui/primitives/dialog";

function LinkWorkPreview({
  state = "ready",
  longTitle = false,
}: {
  state?: "ready" | "loading" | "error" | "empty" | "pending" | "action-error" | "unavailable";
  longTitle?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"task" | "project">("task");
  const [retried, setRetried] = useState(false);
  const [linked, setLinked] = useState(false);
  const [closed, setClosed] = useState(false);
  const failed = !retried && (state === "error" || state === "unavailable");
  const error = failed
    ? Object.assign(new Error("Request failed"), { status: state === "unavailable" ? 403 : 503 })
    : null;
  let title = kind === "task" ? "Ship the launch" : "Product launch";
  if (longTitle) title = "Customer launch checklist — " + "UnbrokenCustomerReference".repeat(8);
  const results =
    state === "loading" || state === "empty" || (failed && state === "error")
      ? []
      : [
          {
            id: "work",
            title,
          },
        ].filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
  if (linked || closed) return <p role="status">{linked ? "Work linked." : "Linking canceled."}</p>;
  return (
    <LinkMessageWork
      query={query}
      kind={kind}
      results={results}
      loading={state === "loading"}
      error={error}
      pendingId={state === "pending" ? "work" : undefined}
      actionError={state === "action-error" ? new Error("Request failed") : null}
      onQueryChange={setQuery}
      onKindChange={setKind}
      onRetry={() => setRetried(true)}
      onLink={() => {
        if (state !== "action-error") setLinked(true);
      }}
      onClose={() => setClosed(true)}
    />
  );
}

const meta = {
  title: "Workspace/Link work",
  component: LinkWorkPreview,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LinkWorkPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Loading: Story = { args: { state: "loading" } };
export const LoadError: Story = { args: { state: "error" } };
export const Empty: Story = { args: { state: "empty" } };
export const Pending: Story = { args: { state: "pending" } };
export const ActionError: Story = { args: { state: "action-error" } };
export const Unavailable: Story = { args: { state: "unavailable" } };
export const Dark: Story = { globals: { theme: "dark" } };
export const LongTitle: Story = { args: { longTitle: true } };
export const LongTitlePending: Story = { args: { longTitle: true, state: "pending" } };
export const DialogPanel: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle className="sr-only">Link work from a message</DialogTitle>
        <DialogDescription className="sr-only">
          Choose existing work to link without changing its access.
        </DialogDescription>
        <LinkWorkPreview longTitle />
      </DialogContent>
    </Dialog>
  ),
};
