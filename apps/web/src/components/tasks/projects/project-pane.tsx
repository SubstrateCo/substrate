import { useNavigate } from "@tanstack/react-router";

import { WorkDiscussions } from "../../context/discussions/work-discussions";
import { CopyLink } from "../../context/links/copy-link";
import { TaskDetail } from "../detail/task-detail";
import { TaskForm } from "../editor/task-form";
import { ProjectDangerZone } from "./editor/project-danger-zone";
import { ProjectForm } from "./editor/project-form";
import { ProjectPicture } from "./editor/project-picture";
import { ProjectArchivedNotice } from "./project-archived-notice";
import { ProjectExport } from "./project-export";
import { ProjectSharing } from "./sharing/project-sharing";
import { useProjectRestore } from "./use-project-restore";
import { ProjectPane as ProjectPaneView } from "@/components/tasks/projects/project-pane-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { workLink } from "@/lib/navigation/record-links";
import { useTaskUpdate } from "@/queries/tasks/mutations";
import { useProject } from "@/queries/tasks/use-project";
import { toast } from "sonner";

export function ProjectPane({
  projectEntityId,
  taskId,
}: {
  projectEntityId: string;
  taskId?: string;
}) {
  const { organizationId } = useWorkspaceScope();
  const { query: project, resource, capabilities } = useProject(organizationId, projectEntityId);
  const archivedAt = resource.data?.project.archivedAt;
  const update = useTaskUpdate(organizationId, projectEntityId);
  const restore = useProjectRestore(organizationId);
  const navigate = useNavigate();
  const archivedById = resource.data?.project.archivedByActorEntityId;
  const archivedBy = archivedById
    ? (resource.data?.actors.find((actor) => actor.entityId === archivedById)?.name ??
      resource.data?.members.find((member) => member.actorEntityId === archivedById)?.name)
    : undefined;
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
        <>
          <CopyLink
            grouped
            label="Copy project link"
            link={workLink(organizationId, projectEntityId)}
          />
          <ProjectExport projectEntityId={projectEntityId} />
        </>
      }
      renderContext={() => (
        <WorkDiscussions entityId={projectEntityId} label="Project discussions" variant="page" />
      )}
      onRetry={() => void project.refetch()}
      notice={
        archivedAt && (
          <ProjectArchivedNotice
            archivedAt={archivedAt}
            archivedBy={archivedBy}
            restorePending={restore.pendingId === projectEntityId}
            onRestore={capabilities.canArchive ? () => restore.restore(projectEntityId) : undefined}
          />
        )
      }
      renderSettings={(detail) => (
        <>
          {capabilities.canEdit && (
            <>
              <ProjectPicture project={detail.project} />
              <ProjectForm project={detail.project} />
            </>
          )}
          <ProjectSharing projectEntityId={projectEntityId} />
          {capabilities.canArchive && <ProjectDangerZone project={detail.project} />}
        </>
      )}
      renderTaskForm={({
        parentTaskEntityId,
        onSaved,
        onCancel,
        status: initialStatus,
        renderCreate,
      }) => (
        <TaskForm
          projectEntityId={projectEntityId}
          parentTaskEntityId={parentTaskEntityId}
          onSaved={onSaved}
          onCancel={onCancel}
          initialStatus={initialStatus}
          renderCreate={renderCreate}
        />
      )}
      renderTaskDetail={({ taskId: selected, onSubtask, onSelectTask }) => (
        <TaskDetail
          visible
          key={selected}
          projectEntityId={projectEntityId}
          taskId={selected}
          onSubtask={onSubtask}
          onSelectTask={onSelectTask}
        />
      )}
    />
  );
}
