import { useQuery } from "@tanstack/react-query";
import { TasksWorkspace as TasksWorkspaceView } from "@startup-os/ui/tasks/tasks-workspace";
import { projectsQueryOptions } from "@/queries/tasks/options";
import { ProjectForm } from "./project-form";
import { ProjectPane } from "./project-pane";

export function TasksWorkspace({ organizationId }: { organizationId: string }) {
  const projects = useQuery(projectsQueryOptions(organizationId));
  return (
    <TasksWorkspaceView
      projects={projects.data ?? []}
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
