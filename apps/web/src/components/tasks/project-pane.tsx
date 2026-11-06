import { useQuery } from "@tanstack/react-query";
import { ProjectPane as ProjectPaneView } from "@startup-os/ui/tasks/project-pane";
import { projectQueryOptions } from "@/queries/tasks/options";
import { TaskForm } from "./task-form";
import { TaskDetail } from "./task-detail";
import { ProjectForm } from "./project-form";
import { ProjectSharing } from "./project-sharing";
import { ProjectStatuses } from "./project-statuses";

export function ProjectPane({
  organizationId,
  projectEntityId,
}: {
  organizationId: string;
  projectEntityId: string;
}) {
  const project = useQuery(projectQueryOptions(organizationId, projectEntityId));
  return (
    <ProjectPaneView
      data={project.data}
      loading={project.isPending}
      error={project.error}
      onRetry={() => void project.refetch()}
      renderProjectEditor={(detail, onDone) => (
        <ProjectForm
          organizationId={organizationId}
          project={detail.project}
          onCancel={onDone}
          onSaved={onDone}
        />
      )}
      renderTaskForm={(detail, parentTaskEntityId, onSaved, onCancel) => (
        <TaskForm
          organizationId={organizationId}
          detail={detail}
          parentTaskEntityId={parentTaskEntityId}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      )}
      renderTaskDetail={(detail, task, onClose, onSubtask) => (
        <TaskDetail
          key={task.entityId}
          organizationId={organizationId}
          detail={detail}
          task={task}
          onClose={onClose}
          onSubtask={onSubtask}
        />
      )}
      renderSettings={(detail) => (
        <>
          <ProjectSharing organizationId={organizationId} detail={detail} />
          <ProjectStatuses organizationId={organizationId} detail={detail} />
        </>
      )}
    />
  );
}
