import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectPane } from "@startup-os/ui/tasks/project-pane";
import { SourceTaskFields } from "@startup-os/ui/context/source-task-fields";
import { CreateSourceTask } from "@startup-os/ui/context/create-source-task";
import { EntityReference } from "@startup-os/ui/messaging/entity-reference";
import { Button } from "@startup-os/ui/primitives/button";
import { taskProject } from "../scenes/tasks-fixtures";

function WorkspaceLoading({
  scene = "project",
  hasSourceText = true,
}: {
  scene?: "project" | "fields" | "reference";
  hasSourceText?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const fields = (sourceText: string) => (
    <SourceTaskFields
      detail={ready ? taskProject : undefined}
      loading={!ready}
      onRetry={() => setReady(true)}
      onSubmit={() => {}}
      onCancel={() => {}}
      sourceText={hasSourceText ? sourceText : undefined}
    />
  );
  return (
    <div className="space-y-4 p-4">
      <Button variant="outline" onClick={() => setReady(true)}>
        Resolve loading
      </Button>
      {scene === "project" && (
        <section aria-label="Project fixture" className="flex h-screen max-w-3xl">
          <ProjectPane
            data={ready ? taskProject : undefined}
            loading={!ready}
            onRetry={() => setReady(true)}
            renderProjectEditor={() => null}
            renderTaskForm={() => null}
            renderTaskDetail={() => null}
            renderSettings={() => null}
          />
        </section>
      )}
      {scene === "fields" && (
        <div className="max-w-xl">
          <CreateSourceTask
            body="Customer asked for a launch checklist."
            projects={[{ id: "launch", title: "Product launch" }]}
            loading={false}
            onRetry={() => {}}
            onClose={() => {}}
            renderFields={(_, sourceText) => fields(sourceText)}
          />
        </div>
      )}
      {scene === "reference" && (
        <section aria-label="Inline references" className="space-y-4 text-sm">
          <p>
            Follow <EntityReference loading /> for updates.
          </p>
          <p>
            Follow <EntityReference /> for updates.
          </p>
        </section>
      )}
    </div>
  );
}

const meta = {
  title: "Workspace/Loading shapes",
  component: WorkspaceLoading,
} satisfies Meta<typeof WorkspaceLoading>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Project: Story = {};
export const SourceFields: Story = { args: { scene: "fields" } };
export const FieldsWithoutSourceCopy: Story = {
  args: { scene: "fields", hasSourceText: false },
};
export const InlineReference: Story = { args: { scene: "reference" } };
