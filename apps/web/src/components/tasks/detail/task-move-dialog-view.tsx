import type { ReactNode } from "react";

import { TaskSelect } from "../task-select";
import type { Project, Task } from "../types";
import { ErrorState } from "@/components/feedback/error-state";
import { FormDialog } from "@/components/feedback/form-dialog";

export function TaskMoveDialog({
  title,
  projectId,
  parentId,
  projects,
  parents,
  loading,
  loadError,
  canEdit,
  pending,
  error,
  unchanged,
  changesAccess,
  onProjectChange,
  onParentChange,
  onClose,
  onRestoreFocus,
  onRetry,
  onSubmit,
}: {
  title: string;
  projectId: string;
  parentId: string;
  projects: Project[];
  parents: Task[];
  loading: boolean;
  loadError: Error | null;
  canEdit: boolean;
  pending: boolean;
  error: Error | null;
  unchanged: boolean;
  changesAccess: boolean;
  onProjectChange: (id: string) => void;
  onParentChange: (id: string) => void;
  onClose: () => void;
  onRestoreFocus: () => void;
  onRetry: () => void;
  onSubmit: () => void;
}) {
  const unavailable = loading || !!loadError || !canEdit;
  const canSubmit = !pending && !unchanged && !unavailable;
  let destination: ReactNode;
  if (loadError) destination = <ErrorState title="Couldn’t load destination" onRetry={onRetry} />;
  else if (loading)
    destination = (
      <p role="status" className="text-sm text-muted-foreground">
        Loading destination…
      </p>
    );
  else if (canEdit)
    destination = (
      <TaskSelect
        label="Parent task"
        value={parentId}
        onChange={onParentChange}
        options={[
          { value: "none", label: "No parent task" },
          ...parents.map((task) => ({ value: task.entityId, label: task.title })),
        ]}
      />
    );
  else
    destination = (
      <p role="status" className="text-sm text-muted-foreground">
        You need edit access to the destination project.
      </p>
    );
  return (
    <FormDialog
      title="Move task"
      description={<>Choose a project and parent for “{title}”. Its subtasks move with it.</>}
      size="default"
      saveLabel="Move task"
      pendingLabel="Moving task…"
      pending={pending}
      disabled={!canSubmit}
      error={error}
      errorDescription="Couldn’t move this task. Check the destination and try again."
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onSubmit={() => {
        if (canSubmit) onSubmit();
      }}
    >
      <TaskSelect
        label="Destination project"
        value={projectId}
        onChange={onProjectChange}
        options={projects.map((project) => ({
          value: project.entityId,
          label: project.name,
        }))}
      />
      {destination}
      {changesAccess && (
        <p className="text-sm text-muted-foreground">
          The task, its subtasks, comments, and attachments will use the destination project’s
          access. People there may gain access, and people in the original project may lose it.
        </p>
      )}
    </FormDialog>
  );
}
