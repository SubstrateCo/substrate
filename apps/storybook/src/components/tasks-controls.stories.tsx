import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskForm } from "@startup-os/ui/tasks/task-form";
import { ProjectForm } from "@startup-os/ui/tasks/project-form";
import { TaskCommentForm } from "@startup-os/ui/tasks/task-comment-form";
import { ProjectSharing } from "@startup-os/ui/tasks/project-sharing";
import { TaskList } from "@startup-os/ui/tasks/task-list";
import { Button } from "@startup-os/ui/primitives/button";
import { taskProject } from "../scenes/tasks-fixtures";
import { populatedProjects } from "../scenes/tasks-dense-fixtures";

function SaveRecovery() {
  const [error, setError] = useState<Error | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <div className="mx-auto max-w-lg p-6">
      {saved ? (
        <p role="status">Task saved</p>
      ) : (
        <TaskForm
          detail={taskProject}
          error={error}
          onCancel={() => undefined}
          onSubmit={() => (error ? setSaved(true) : setError(new Error("Offline")))}
        />
      )}
    </div>
  );
}

function SaveWorkflow({ kind }: { kind: "task" | "project" | "sharing" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [saved, setSaved] = useState(false);
  const begin = () => {
    setError(null);
    setPending(true);
  };
  const props = { pending, error };
  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      {kind === "task" && (
        <TaskForm {...props} detail={taskProject} onSubmit={begin} onCancel={() => undefined} />
      )}
      {kind === "project" && <ProjectForm {...props} onSubmit={begin} onCancel={() => undefined} />}
      {kind === "sharing" && (
        <ProjectSharing {...props} detail={taskProject} onShare={begin} onRevoke={begin} />
      )}
      {pending && (
        <div className="flex gap-2" aria-label="Story save response">
          <Button
            onClick={() => {
              setPending(false);
              setError(new Error("Offline"));
            }}
          >
            Fail save
          </Button>
          <Button
            onClick={() => {
              setPending(false);
              setSaved(true);
            }}
          >
            Complete save
          </Button>
        </div>
      )}
      {saved && <p role="status">Changes saved</p>}
    </div>
  );
}

const meta = {
  title: "Projects/Components/Task controls",
  component: SaveRecovery,
} satisfies Meta<typeof SaveRecovery>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SaveFailure: Story = {};
export const TaskSaveWorkflow: Story = {
  render: () => <SaveWorkflow kind="task" />,
};
export const ProjectSaveWorkflow: Story = {
  render: () => <SaveWorkflow kind="project" />,
};
export const SharingSaveWorkflow: Story = {
  render: () => <SaveWorkflow kind="sharing" />,
};
export const PendingForms: Story = {
  render: () => (
    <div className="grid gap-8 p-6 md:grid-cols-2">
      <TaskForm
        detail={taskProject}
        task={taskProject.tasks[0]}
        pending
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />
      <ProjectForm
        project={taskProject.project}
        pending
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />
      <TaskCommentForm pending onSend={() => undefined} />
      <ProjectSharing
        detail={taskProject}
        pending
        onShare={() => undefined}
        onRevoke={() => undefined}
      />
    </div>
  ),
};
export const StatusAndPriorityCues: Story = {
  render: () => (
    <div className="p-6">
      <TaskList
        detail={populatedProjects[0]!}
        selectedId={populatedProjects[0]!.tasks[0]!.entityId}
        onSelect={() => undefined}
      />
    </div>
  ),
};
