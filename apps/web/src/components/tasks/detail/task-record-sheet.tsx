import { useNavigate } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { TaskDetail } from "./task-detail";
import { TaskSheet, UnavailableTask } from "./task-sheet";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageSheetBody, PageSheetHeader } from "@/components/layout/page-sheet";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { workLink } from "@/lib/navigation/record-links";
import { useProject } from "@/queries/tasks/use-project";

export type TaskRecord = { projectEntityId: string; taskEntityId: string };

/**
 * A task opened over another app, outside its project page. It loads the task's project; another
 * task chosen in it opens in Tasks.
 */
export function TaskRecordSheet({
  open,
  task,
  onClose,
}: {
  open: boolean;
  task: TaskRecord;
  onClose: () => void;
}) {
  return (
    <TaskSheet open={open} onClose={onClose}>
      <TaskRecordContent key={task.taskEntityId} {...task} />
    </TaskSheet>
  );
}

function TaskRecordContent({ projectEntityId, taskEntityId }: TaskRecord) {
  const { organizationId } = useWorkspaceScope();
  const navigate = useNavigate();
  const { query, resource } = useProject(organizationId, projectEntityId);
  const unavailable = "This task was removed or you no longer have access.";
  if (!resource.data) {
    if (resource.status === "loading")
      return (
        <TaskRecordState>
          <LoadingState label="Loading task" />
        </TaskRecordState>
      );
    if (resource.status === "unavailable") return <UnavailableTask description={unavailable} />;
    return (
      <TaskRecordState>
        <ErrorState title="Couldn’t load task" onRetry={() => void query.refetch()} />
      </TaskRecordState>
    );
  }
  if (!resource.data.tasks.some((candidate) => candidate.entityId === taskEntityId))
    return <UnavailableTask description={unavailable} />;
  return (
    <TaskDetail
      visible
      projectEntityId={projectEntityId}
      taskId={taskEntityId}
      onSelectTask={(id) => void navigate(workLink(organizationId, projectEntityId, id))}
    />
  );
}

function TaskRecordState({ children }: { children: ReactNode }) {
  return (
    <>
      <PageSheetHeader title="Task" />
      <PageSheetBody className="flex flex-col">{children}</PageSheetBody>
    </>
  );
}
