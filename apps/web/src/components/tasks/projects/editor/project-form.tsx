import type { ComponentProps } from "react";

import { ProjectForm as ProjectFormView } from "@/components/tasks/projects/editor/project-form-view";
import type { Project } from "@/components/tasks/types";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useTasksMutation } from "@/queries/tasks/mutations";

export function ProjectForm({
  project,
  onSaved,
  renderCreate,
}: {
  project?: Project;
  onSaved?: (id: string) => void;
  renderCreate?: ComponentProps<typeof ProjectFormView>["renderCreate"];
}) {
  const { organizationId } = useWorkspaceScope();
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
