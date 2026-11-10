import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { WorkDiscussions } from "../../context/discussions/work-discussions";
import { CopyLink } from "../../context/links/copy-link";
import { TaskDetail } from "../detail/task-detail";
import { TaskForm } from "../editor/task-form";
import { ProjectForm } from "./editor/project-form";
import { ProjectPicture } from "./editor/project-picture";
import { ProjectSharing } from "./sharing/project-sharing";
import { ProjectPane as ProjectPaneView } from "@/components/tasks/projects/project-pane-view";
import { workHref } from "@/lib/navigation/record-links";
import { useTaskUpdate } from "@/queries/tasks/mutations";
import { projectQueryOptions } from "@/queries/tasks/options";
import { toast } from "sonner";

export function ProjectPane({
  organizationId,
  projectEntityId,
}: {
  organizationId: string;
  projectEntityId: string;
}) {
  const project = useQuery(projectQueryOptions(organizationId, projectEntityId));
  const update = useTaskUpdate(organizationId, projectEntityId);
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  return (
    <ProjectPaneView
      data={project.data}
      selectedTaskId={search.taskId ?? null}
      onSelectTask={(taskId) =>
        void navigate({
          to: "/tasks",
          search: {
            workspaceId: organizationId,
            projectId: projectEntityId,
            taskId: taskId ?? undefined,
          },
        })
      }
      onTaskStatusChange={(task, status) =>
        update.mutate(
          {
            taskEntityId: task.entityId,
            title: task.title,
            description: task.description,
            status,
            priority: task.priority,
            assigneeActorEntityId: task.assigneeActorEntityId,
            dueDate: task.dueDate,
          },
          { onError: () => toast.error("Couldn't change the status. It was set back.") },
        )
      }
      headerActions={
        <CopyLink
          grouped
          label="Copy project link"
          href={workHref(organizationId, projectEntityId)}
        />
      }
      context={
        project.data &&
        !project.error && (
          <WorkDiscussions
            organizationId={organizationId}
            entityId={projectEntityId}
            label="Project discussions"
            variant="page"
          />
        )
      }
      loading={project.isPending}
      error={project.error}
      onRetry={() => void project.refetch()}
      editor={
        project.data && (
          <>
            <ProjectPicture organizationId={organizationId} project={project.data.project} />
            <ProjectForm organizationId={organizationId} project={project.data.project} />
          </>
        )
      }
      sharing={
        project.data && <ProjectSharing organizationId={organizationId} detail={project.data} />
      }
      renderTaskForm={(detail, parentTaskEntityId, onSaved, onCancel, initialStatus) => (
        <TaskForm
          organizationId={organizationId}
          detail={detail}
          parentTaskEntityId={parentTaskEntityId}
          onSaved={onSaved}
          onCancel={onCancel}
          initialStatus={initialStatus}
          variant="dialog"
        />
      )}
      renderTaskDetail={(detail, task, onClose, onSubtask, onSelectTask, onDirtyChange) => (
        <TaskDetail
          visible
          key={task.entityId}
          organizationId={organizationId}
          detail={detail}
          task={task}
          onClose={onClose}
          onSubtask={onSubtask}
          onSelectTask={onSelectTask}
          onDirtyChange={onDirtyChange}
        />
      )}
    />
  );
}
