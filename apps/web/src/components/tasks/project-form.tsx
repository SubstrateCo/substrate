import { ProjectForm as ProjectFormView } from "@/ui/tasks/project-form";
import type { Project } from "@/ui/tasks/types";
import { useTasksMutation } from "./use-tasks-mutation";

export function ProjectForm({
  organizationId,
  project,
  onSaved,
  onCancel,
}: {
  organizationId: string;
  project?: Project;
  onSaved: (id: string) => void;
  onCancel: () => void;
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
          { onSuccess: ({ id }) => onSaved(id) },
        )
      }
    />
  );
}
