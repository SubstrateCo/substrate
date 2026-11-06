import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreateSourceTask } from "@startup-os/ui/context/create-source-task";
import { SourceTaskFields } from "@startup-os/ui/context/source-task-fields";
import { taskProject } from "../scenes/tasks-fixtures";

function SourceTaskPreview({
  state = "ready",
}: {
  state?:
    | "ready"
    | "loading"
    | "error"
    | "empty"
    | "fields-loading"
    | "fields-error"
    | "saving"
    | "save-error"
    | "created"
    | "unavailable";
}) {
  const [created, setCreated] = useState(state === "created");
  const [closed, setClosed] = useState(false);
  const [retried, setRetried] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const failed = !retried && (state === "error" || state === "unavailable");
  const error = failed
    ? Object.assign(new Error("Request failed"), { status: state === "unavailable" ? 403 : 503 })
    : null;
  if (closed) return <p role="status">Task creation closed.</p>;
  return (
    <CreateSourceTask
      body="Customer asked for a launch checklist. Please check with @[person:alex]."
      projects={
        state === "empty" || state === "loading" || (failed && state === "error")
          ? []
          : [{ id: "launch", title: "Product launch" }]
      }
      loading={state === "loading"}
      error={error}
      onRetry={() => setRetried(true)}
      createdHref={created ? "#created-task" : undefined}
      onClose={() => setClosed(true)}
      renderFields={(_projectId, sourceText) => (
        <SourceTaskFields
          detail={state === "fields-error" && !retried ? undefined : taskProject}
          loading={state === "fields-loading"}
          loadError={state === "fields-error" && !retried ? new Error("Request failed") : null}
          onRetry={() => setRetried(true)}
          sourceText={sourceText}
          pending={state === "saving"}
          error={saveFailed ? new Error("Request failed") : null}
          onCancel={() => setClosed(true)}
          onSubmit={() => {
            if (state === "save-error" && !saveFailed) setSaveFailed(true);
            else setCreated(true);
          }}
        />
      )}
    />
  );
}

const meta = {
  title: "Workspace/Create source task",
  component: SourceTaskPreview,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SourceTaskPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Loading: Story = { args: { state: "loading" } };
export const LoadError: Story = { args: { state: "error" } };
export const Empty: Story = { args: { state: "empty" } };
export const FieldsLoading: Story = { args: { state: "fields-loading" } };
export const FieldsError: Story = { args: { state: "fields-error" } };
export const Saving: Story = { args: { state: "saving" } };
export const SaveError: Story = { args: { state: "save-error" } };
export const Created: Story = { args: { state: "created" } };
export const Unavailable: Story = { args: { state: "unavailable" } };
export const Dark: Story = { globals: { theme: "dark" } };
