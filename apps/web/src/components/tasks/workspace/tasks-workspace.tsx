import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";

import { useEffect, useState } from "react";

import { ProjectForm } from "../projects/editor/project-form";
import { ProjectPane } from "../projects/project-pane";
import type { ProjectTab } from "../projects/project-tabs";
import { useProjectRestore } from "../projects/use-project-restore";
import { TasksWorkspace as TasksWorkspaceView } from "@/components/tasks/workspace/tasks-workspace-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { workLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import {
  archivedProjectsQueryOptions,
  projectsQueryOptions,
  taskLocationQueryOptions,
} from "@/queries/tasks/options";

export function TasksWorkspace({
  projectId,
  taskId,
  tab = "tasks",
}: {
  projectId?: string;
  taskId?: string;
  tab?: ProjectTab;
}) {
  const { organizationId } = useWorkspaceScope();
  const projects = useQuery(projectsQueryOptions(organizationId));
  const archived = useQuery(archivedProjectsQueryOptions(organizationId));
  const restore = useProjectRestore(organizationId);
  const navigate = useNavigate({ from: "/tasks/" });
  const taskLocation = useQuery(taskLocationQueryOptions(organizationId, taskId));
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
  useEffect(() => {
    const defaultSelection = !projectId && !taskId && projects.isSuccess;
    if (defaultSelection && selectedProjectId)
      void navigate({
        to: "/tasks",
        search: (previous) => ({ ...previous, projectId: selectedProjectId }),
        replace: true,
        resetScroll: false,
      });
  }, [navigate, projectId, projects.isSuccess, selectedProjectId, taskId]);
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
          <ProjectForm onSaved={onSaved} renderCreate={renderCreate} />
        )}
        project={
          selectedProjectId && (
            <ProjectPane
              key={`${organizationId}:${selectedProjectId}`}
              projectEntityId={selectedProjectId}
              taskId={taskId}
              tab={taskId ? "tasks" : tab}
            />
          )
        }
      />
    </>
  );
}
