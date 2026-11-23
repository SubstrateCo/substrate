import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { SettingsCard } from "@/components/layout/settings-section";
import type { Project } from "@/components/tasks/types";
import { Button } from "@/components/ui/button";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { Archive } from "lucide-react";

/** The danger zone of an active project: archive it to make it read-only. */
export function ProjectArchive({
  organizationId,
  project,
}: {
  organizationId: string;
  project: Project;
}) {
  const archive = useTasksMutation(organizationId);
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const focusReturn = useFocusReturn(button);
  return (
    <>
      <SettingsCard
        tone="destructive"
        title="Archive project"
        description="Make this project and its tasks read-only. Project owners and admins can restore or delete it later."
      >
        <Button
          ref={button}
          className="w-fit"
          variant="destructive-ghost"
          disabled={archive.isPending}
          onClick={() => {
            focusReturn.remember();
            archive.reset();
            setConfirming(true);
          }}
        >
          <Archive aria-hidden="true" />
          Archive project
        </Button>
      </SettingsCard>
      {confirming && (
        <ConfirmDialog
          title={`Archive “${project.name}”?`}
          description="Its tasks, comments, and linked messages stay readable to people with access, but no one can change them, add tasks, or post comments until a project owner or admin restores it. It moves to Archived in the project list."
          confirmLabel="Archive project"
          pendingLabel="Archiving project."
          pending={archive.isPending}
          error={archive.error}
          errorDescription="Couldn’t archive this project. Try again."
          onRestoreFocus={focusReturn.restore}
          onClose={() => {
            setConfirming(false);
            archive.reset();
          }}
          onConfirm={() =>
            archive.mutate(
              { action: "archiveProject", organizationId, projectEntityId: project.entityId },
              { onSuccess: () => setConfirming(false) },
            )
          }
        />
      )}
    </>
  );
}
