import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkDiscussions } from "@startup-os/ui/context/work-discussions";
import { TaskActivity } from "@startup-os/ui/context/task-activity";
import { ProjectReference } from "@startup-os/ui/context/project-reference";
import { ProjectDiscussions } from "@startup-os/ui/context/project-discussions";

function ContextPreview({
  state = "ready",
  project = false,
}: {
  state?: "ready" | "loading" | "error" | "empty" | "refresh-error" | "unavailable";
  project?: boolean;
}) {
  const [retried, setRetried] = useState(false);
  const failed = !retried && ["error", "refresh-error", "unavailable"].includes(state);
  const error = failed
    ? Object.assign(new Error("Request failed"), { status: state === "unavailable" ? 403 : 503 })
    : null;
  const empty = state === "loading" || state === "empty" || (failed && state === "error");
  const discussions = (
    <WorkDiscussions
      items={
        empty
          ? []
          : [
              {
                messageId: "source",
                purpose: "source",
                href: "#message",
                conversationName: "Launch team",
                authorName: "Alex Morgan",
                createdAt: "2026-11-06T09:00:00Z",
                body: "Customer asked for a launch checklist. @[person:alex] can help.",
              },
            ]
      }
      loading={state === "loading"}
      error={error}
      onRetry={() => setRetried(true)}
    >
      {!project && <ProjectReference href="#project" name="Product launch" />}
    </WorkDiscussions>
  );
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      {project ? <ProjectDiscussions>{discussions}</ProjectDiscussions> : discussions}
      {!project && (
        <TaskActivity
          items={
            empty ? [] : [{ id: "activity", action: "Task created", actorName: "Alex Morgan" }]
          }
          loading={state === "loading"}
          error={error}
          onRetry={() => setRetried(true)}
        />
      )}
    </div>
  );
}

const meta = { title: "Workspace/Related context", component: ContextPreview } satisfies Meta<
  typeof ContextPreview
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Loading: Story = { args: { state: "loading" } };
export const LoadError: Story = { args: { state: "error" } };
export const Empty: Story = { args: { state: "empty" } };
export const RefreshError: Story = { args: { state: "refresh-error" } };
export const Unavailable: Story = { args: { state: "unavailable" } };
export const Project: Story = { args: { project: true } };
export const Dark: Story = { globals: { theme: "dark" } };
