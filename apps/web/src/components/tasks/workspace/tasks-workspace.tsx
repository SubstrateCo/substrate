import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { ProjectForm } from "../projects/editor/project-form";
import { ProjectPane } from "../projects/project-pane";
import { useProjectRestore } from "../projects/use-project-restore";
import { TasksWorkspace as TasksWorkspaceView } from "@/components/tasks/workspace/tasks-workspace-view";
import { workLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import {
  archivedProjectsQueryOptions,
  projectsQueryOptions,
  taskLocationQueryOptions,
} from "@/queries/tasks/options";

export function TasksWorkspace({
  organizationId,
  projectId,
  taskId,
}: {
  organizationId: string;
  projectId?: string;
  taskId?: string;
}) {
  const projects = useQuery(projectsQueryOptions(organizationId));
  const archived = useQuery(archivedProjectsQueryOptions(organizationId));
  const restore = useProjectRestore(organizationId);
  const navigate = useNavigate();
  const taskLocation = useQuery(taskLocationQueryOptions(organizationId, taskId));
  // A task link can name an old project or none. Open the task in the project that holds it now.
  const relocatedProjectId =
    taskId && !taskLocation.error && taskLocation.data?.projectEntityId !== projectId
      ? taskLocation.data?.projectEntityId
      : undefined;
  const [lastSelection, setLastSelection] = useState<{
    organizationId: string;
    projectId?: string;
  }>({ organizationId });
  const resource = resourceState(projects);
  const defaultProjectId = resource.data?.[0]?.entityId;
  const selectedProjectId =
    projectId ??
    (projects.isPending && lastSelection.organizationId === organizationId
      ? lastSelection.projectId
      : defaultProjectId);
  if (
    lastSelection.organizationId !== organizationId ||
    lastSelection.projectId !== selectedProjectId
  )
    setLastSelection({ organizationId, projectId: selectedProjectId });
  return (
    <>
      {relocatedProjectId && (
        <Navigate
          to="/tasks"
          replace
          search={{ workspaceId: organizationId, projectId: relocatedProjectId, taskId }}
        />
      )}
      <TasksWorkspaceView
        state={resource.status}
        projects={resource.data ?? []}
        archivedProjects={resourceState(archived).data ?? []}
        onRestoreProject={restore.restore}
        restoringProjectId={restore.pendingId}
        selectedProjectId={selectedProjectId}
        projectLink={(id) => workLink(organizationId, id)}
        onSelectProject={(selected) =>
          void navigate({
            to: "/tasks",
            search: { workspaceId: organizationId, projectId: selected },
          })
        }
        loading={projects.isPending}
        error={projects.error}
        onRetry={() => void projects.refetch()}
        renderCreate={({ onSaved, renderCreate }) => (
          <ProjectForm
            organizationId={organizationId}
            onSaved={onSaved}
            renderCreate={renderCreate}
          />
        )}
        project={
          selectedProjectId && (
            <ProjectPane
              key={`${organizationId}:${selectedProjectId}`}
              organizationId={organizationId}
              projectEntityId={selectedProjectId}
              taskId={taskId}
            />
          )
        }
      />
    </>
  );
}
