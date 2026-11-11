import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { useEffect, useState } from "react";

import { ProjectForm } from "../projects/editor/project-form";
import { ProjectPane } from "../projects/project-pane";
import { TasksWorkspace as TasksWorkspaceView } from "@/components/tasks/workspace/tasks-workspace-view";
import { resourceState } from "@/lib/resource-state";
import { projectsQueryOptions, taskLocationQueryOptions } from "@/queries/tasks/options";

export function TasksWorkspace({ organizationId }: { organizationId: string }) {
  const projects = useQuery(projectsQueryOptions(organizationId));
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const taskLocation = useQuery({
    ...taskLocationQueryOptions(organizationId, search.taskId ?? ""),
    enabled: !!search.taskId,
  });
  useEffect(() => {
    const resolvedLocation = !taskLocation.error ? taskLocation.data : undefined;
    if (search.taskId && resolvedLocation && resolvedLocation.projectEntityId !== search.projectId)
      void navigate({
        to: "/tasks",
        replace: true,
        search: {
          workspaceId: organizationId,
          projectId: resolvedLocation.projectEntityId,
          taskId: search.taskId,
        },
      });
  }, [
    navigate,
    organizationId,
    search.taskId,
    search.projectId,
    taskLocation.data,
    taskLocation.error,
  ]);
  const [lastSelection, setLastSelection] = useState<{
    organizationId: string;
    projectId?: string;
  }>({ organizationId });
  const resource = resourceState(projects);
  const defaultProjectId = resource.data?.[0]?.entityId;
  const selectedProjectId =
    search.projectId ??
    (projects.isPending && lastSelection.organizationId === organizationId
      ? lastSelection.projectId
      : defaultProjectId);
  if (
    lastSelection.organizationId !== organizationId ||
    lastSelection.projectId !== selectedProjectId
  )
    setLastSelection({ organizationId, projectId: selectedProjectId });
  return (
    <TasksWorkspaceView
      state={resource.status}
      projects={resource.data ?? []}
      selectedProjectId={selectedProjectId}
      onSelectProject={(projectId) =>
        void navigate({ to: "/tasks", search: { workspaceId: organizationId, projectId } })
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
          />
        )
      }
    />
  );
}
