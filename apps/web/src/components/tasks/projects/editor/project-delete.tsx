import { useNavigate } from "@tanstack/react-router";

import { DangerZoneCard } from "@/components/feedback/danger-zone-card";
import type { Project } from "@/components/tasks/types";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useTasksMutation } from "@/queries/tasks/mutations";

export function ProjectDelete({ project }: { project: Project }) {
  const { organizationId } = useWorkspaceScope();
  const remove = useTasksMutation(organizationId);
  const navigate = useNavigate();
  return (
    <DangerZoneCard
      title="Delete project"
      description="Remove this archived project and all its tasks and subtasks."
      confirmTitle={`Delete “${project.name}”?`}
      confirmDescription="The project and all its tasks and subtasks will be removed. Their comments and attachments will no longer be accessible through this project. This cannot be undone in the app."
      pending={remove.isPending}
      error={remove.error}
      errorDescription="Couldn’t delete this project. Try again."
      onReset={() => remove.reset()}
      onConfirm={(onDeleted) =>
        remove.mutate(
          { action: "deleteProject", organizationId, projectEntityId: project.entityId },
          {
            onSuccess: () => {
              onDeleted();
              void navigate({ to: "/tasks", search: { workspaceId: organizationId } });
            },
          },
        )
      }
    />
  );
}
