import { useTasksMutation } from "../../use-tasks-mutation";
import { ProjectForm as ProjectFormView } from "@/components/tasks/projects/editor/project-form-view";
import type { Project } from "@/components/tasks/types";

export function ProjectForm({
  organizationId,
  project,
  onSaved,
  onCancel,
}: {
  organizationId: string;
  project?: Project;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
}) {
  const save = useTasksMutation(organizationId);
  return (
    <ProjectFormView
      project={project}
      pending={save.isPending}
      error={save.error}
      onCancel={onCancel}
      onSubmit={(draft) =>
        save.mutate(
          project
            ? {
                action: "updateProject",
                organizationId,
                projectEntityId: project.entityId,
                ...draft,
              }
            : { action: "createProject", organizationId, ...draft },
          { onSuccess: ({ id }) => onSaved?.(id) },
        )
      }
    />
  );
}
