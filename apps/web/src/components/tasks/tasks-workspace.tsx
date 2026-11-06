import { useQuery } from "@tanstack/react-query";
import { TasksWorkspace as TasksWorkspaceView } from "@/ui/tasks/tasks-workspace";
import { projectsQueryOptions } from "@/queries/tasks/options";
import { ProjectForm } from "./project-form";
import { ProjectPane } from "./project-pane";
import { useNavigate, useSearch } from "@tanstack/react-router";

export function TasksWorkspace({ organizationId }: { organizationId: string }) {
  const projects = useQuery(projectsQueryOptions(organizationId));
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  return (
    <TasksWorkspaceView
      projects={projects.data ?? []}
      selectedProjectId={search.projectId}
      onSelectProject={(projectId) =>
        void navigate({ to: "/tasks", search: { workspaceId: organizationId, projectId } })
      }
      loading={projects.isPending}
      error={projects.error}
      onRetry={() => void projects.refetch()}
      renderCreate={(onSaved, onCancel) => (
        <ProjectForm organizationId={organizationId} onSaved={onSaved} onCancel={onCancel} />
      )}
      renderProject={(project) => (
        <ProjectPane
          key={project.entityId}
          organizationId={organizationId}
          projectEntityId={project.entityId}
        />
      )}
    />
  );
}
