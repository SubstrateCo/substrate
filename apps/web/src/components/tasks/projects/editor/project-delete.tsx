import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { SettingsCard } from "@/components/layout/settings-section";
import type { Project } from "@/components/tasks/types";
import { Button } from "@/components/ui/button";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { Trash2 } from "lucide-react";

export function ProjectDelete({
  organizationId,
  project,
}: {
  organizationId: string;
  project: Project;
}) {
  const [confirming, setConfirming] = useState(false);
  const remove = useTasksMutation(organizationId);
  const navigate = useNavigate();
  return (
    <>
      <SettingsCard
        tone="destructive"
        title="Delete project"
        description="Remove this project and all its tasks and subtasks."
      >
        <Button
          className="w-fit"
          variant="destructive-ghost"
          onClick={() => {
            remove.reset();
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          Delete project
        </Button>
      </SettingsCard>
      {confirming && (
        <ConfirmDialog
          title={`Delete “${project.name}”?`}
          description="The project and all its tasks and subtasks will be removed. Their comments and attachments will no longer be accessible through this project. This cannot be undone in the app."
          destructive
          confirmLabel="Delete project"
          pendingLabel="Deleting project…"
          pending={remove.isPending}
          error={remove.error}
          errorDescription="Couldn’t delete this project. Try again."
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            void remove
              .mutateAsync({
                action: "deleteProject",
                organizationId,
                projectEntityId: project.entityId,
              })
              .then(() => navigate({ to: "/tasks", search: { workspaceId: organizationId } }))
              .catch(() => {});
          }}
        />
      )}
    </>
  );
}
