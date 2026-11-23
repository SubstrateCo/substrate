import { DangerZoneCard } from "@/components/feedback/danger-zone-card";
import type { Project } from "@/components/tasks/types";
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
  return (
    <DangerZoneCard
      title="Archive project"
      icon={Archive}
      description="Make this project and its tasks read-only. Project owners and admins can restore or delete it later."
      confirmTitle={`Archive “${project.name}”?`}
      confirmDescription="Its tasks, comments, and linked messages stay readable to people with access, but no one can change them, add tasks, or post comments until a project owner or admin restores it. It moves to Archived in the project list."
      pendingLabel="Archiving project."
      destructive={false}
      pending={archive.isPending}
      error={archive.error}
      errorDescription="Couldn’t archive this project. Try again."
      onReset={archive.reset}
      onConfirm={(onDone) =>
        archive.mutate(
          { action: "archiveProject", organizationId, projectEntityId: project.entityId },
          { onSuccess: onDone },
        )
      }
    />
  );
}
