import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { WorkDiscussions } from "../../context/discussions/work-discussions";
import { CopyLink } from "../../context/links/copy-link";
import { TaskDetail } from "../detail/task-detail";
import { TaskForm } from "../editor/task-form";
import { ProjectDelete } from "./editor/project-delete";
import { ProjectForm } from "./editor/project-form";
import { ProjectPicture } from "./editor/project-picture";
import { ProjectSharing } from "./sharing/project-sharing";
import { ProjectPane as ProjectPaneView } from "@/components/tasks/projects/project-pane-view";
import { workLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { projectCapabilities } from "@/lib/tasks/project-capabilities";
import { useTaskUpdate } from "@/queries/tasks/mutations";
import { projectQueryOptions } from "@/queries/tasks/options";
import { toast } from "sonner";

export function ProjectPane({
  organizationId,
  projectEntityId,
  taskId,
}: {
  organizationId: string;
  projectEntityId: string;
  taskId?: string;
}) {
  const project = useQuery(projectQueryOptions(organizationId, projectEntityId));
  const resource = resourceState(project);
  const capabilities = projectCapabilities(resource.data?.level);
  const update = useTaskUpdate(organizationId, projectEntityId);
  const navigate = useNavigate();
  return (
    <ProjectPaneView
      data={resource.data}
      state={resource.status}
      capabilities={capabilities}
      statusPending={update.isPending}
      selectedTaskId={taskId ?? null}
      onSelectTask={(selected) =>
        void navigate({
          to: "/tasks",
          search: {
            workspaceId: organizationId,
            projectId: projectEntityId,
            taskId: selected ?? undefined,
          },
        })
      }
      onTaskStatusChange={(task, status) =>
        update.mutate(
          {
            taskEntityId: task.entityId,
            status,
          },
          { onError: () => toast.error("Couldn't change the status. It was set back.") },
        )
      }
      headerActions={
        <CopyLink
          grouped
          label="Copy project link"
          link={workLink(organizationId, projectEntityId)}
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
      error={project.error}
      onRetry={() => void project.refetch()}
      editor={
        resource.data && (
          <>
            <ProjectPicture organizationId={organizationId} project={resource.data.project} />
            <ProjectForm organizationId={organizationId} project={resource.data.project} />
            {capabilities.canManage && (
              <ProjectDelete organizationId={organizationId} project={resource.data.project} />
            )}
          </>
        )
      }
      sharing={
        resource.data && <ProjectSharing organizationId={organizationId} detail={resource.data} />
      }
      renderTaskForm={({
        detail,
        parentTaskEntityId,
        onSaved,
        onCancel,
        status: initialStatus,
        renderCreate,
      }) => (
        <TaskForm
          organizationId={organizationId}
          detail={detail}
          parentTaskEntityId={parentTaskEntityId}
          onSaved={onSaved}
          onCancel={onCancel}
          initialStatus={initialStatus}
          renderCreate={renderCreate}
        />
      )}
      renderTaskDetail={({ detail, task, onClose, onSubtask, onSelectTask }) => (
        <TaskDetail
          visible
          key={task.entityId}
          organizationId={organizationId}
          detail={detail}
          task={task}
          onClose={onClose}
          onSubtask={onSubtask}
          onSelectTask={onSelectTask}
        />
      )}
    />
  );
}
