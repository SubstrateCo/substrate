import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { CopyLink } from "../context/copy-link";
import { WorkDiscussions } from "../context/work-discussions";
import { ProjectForm } from "./project-form";
import { ProjectSharing } from "./project-sharing";
import { TaskDetail } from "./task-detail";
import { TaskForm } from "./task-form";
import { ProjectDiscussions } from "@/components/context/project-discussions";
import { ProjectPane as ProjectPaneView } from "@/components/tasks/project-pane-view";
import { workHref } from "@/lib/context-links";
import { projectQueryOptions } from "@/queries/tasks/options";

export function ProjectPane({
  organizationId,
  projectEntityId,
}: {
  organizationId: string;
  projectEntityId: string;
}) {
  const project = useQuery(projectQueryOptions(organizationId, projectEntityId));
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
      headerActions={
        <CopyLink label="Copy project link" href={workHref(organizationId, projectEntityId)} />
      }
      context={
        project.data &&
        !project.error && (
          <ProjectDiscussions>
            <WorkDiscussions
              organizationId={organizationId}
              entityId={projectEntityId}
              label="Project discussions"
            />
          </ProjectDiscussions>
        )
      }
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
        <ProjectSharing organizationId={organizationId} detail={detail} />
      )}
    />
  );
}
