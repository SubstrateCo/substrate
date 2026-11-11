import type { ComponentProps } from "react";

import { ProjectForm as ProjectFormView } from "@/components/tasks/projects/editor/project-form-view";
import type { Project } from "@/components/tasks/types";
import { useTasksMutation } from "@/queries/tasks/mutations";

export function ProjectForm({
  organizationId,
  project,
  onSaved,
  renderCreate,
}: {
  organizationId: string;
  project?: Project;
  onSaved?: (id: string) => void;
  renderCreate?: ComponentProps<typeof ProjectFormView>["renderCreate"];
}) {
  const save = useTasksMutation(organizationId);
  return (
    <ProjectFormView
      project={project}
      pending={save.isPending}
      error={save.error}
      renderCreate={renderCreate}
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
