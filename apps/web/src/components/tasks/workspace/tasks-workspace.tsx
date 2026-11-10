import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { ProjectForm } from "../projects/editor/project-form";
import { ProjectPane } from "../projects/project-pane";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { TasksWorkspace as TasksWorkspaceView } from "@/components/tasks/workspace/tasks-workspace-view";
import { projectsQueryOptions } from "@/queries/tasks/options";

export function TasksWorkspace({ organizationId }: { organizationId: string }) {
  const projects = useQuery(projectsQueryOptions(organizationId));
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const [lastSelection, setLastSelection] = useState<{
    organizationId: string;
    projectId?: string;
  }>({ organizationId });
  const defaultProjectId = isAccessFailure(projects.error)
    ? undefined
    : projects.data?.[0]?.entityId;
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
      projects={projects.data ?? []}
      selectedProjectId={selectedProjectId}
      onSelectProject={(projectId) =>
        void navigate({ to: "/tasks", search: { workspaceId: organizationId, projectId } })
      }
      loading={projects.isPending}
      error={projects.error}
      onRetry={() => void projects.refetch()}
      renderCreate={(onSaved, onCancel) => (
        <ProjectForm organizationId={organizationId} onSaved={onSaved} onCancel={onCancel} />
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
