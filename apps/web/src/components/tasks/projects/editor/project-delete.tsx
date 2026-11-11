import { useNavigate } from "@tanstack/react-router";

import { DeleteRecordCard } from "@/components/feedback/delete-record-card";
import type { Project } from "@/components/tasks/types";
import { useTasksMutation } from "@/queries/tasks/mutations";

export function ProjectDelete({
  organizationId,
  project,
}: {
  organizationId: string;
  project: Project;
}) {
  const remove = useTasksMutation(organizationId);
  const navigate = useNavigate();
  return (
    <DeleteRecordCard
      title="Delete project"
      description="Remove this project and all its tasks and subtasks."
      confirmTitle={`Delete “${project.name}”?`}
      confirmDescription="The project and all its tasks and subtasks will be removed. Their comments and attachments will no longer be accessible through this project. This cannot be undone in the app."
      pending={remove.isPending}
      error={remove.error}
      errorDescription="Couldn’t delete this project. Try again."
      onReset={() => remove.reset()}
      onDelete={() =>
        remove
          .mutateAsync({
            action: "deleteProject",
            organizationId,
            projectEntityId: project.entityId,
          })
          .then(() => navigate({ to: "/tasks", search: { workspaceId: organizationId } }))
      }
    />
  );
}
