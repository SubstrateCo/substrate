import { useTasksMutation } from "../../use-tasks-mutation";
import { ProjectSharing as ProjectSharingView } from "@/components/tasks/projects/sharing/project-sharing-view";
import type { ProjectDetail } from "@/components/tasks/types";

export function ProjectSharing({
  organizationId,
  detail,
}: {
  organizationId: string;
  detail: ProjectDetail;
}) {
  const share = useTasksMutation(organizationId);
  const scope = { organizationId, projectEntityId: detail.project.entityId };
  return (
    <ProjectSharingView
      detail={detail}
      pending={share.isPending}
      error={share.error}
      onShare={(actorEntityId, level) =>
        share.mutate({ action: "share", ...scope, actorEntityId, level })
      }
      onRevoke={(actorEntityId) => share.mutate({ action: "revoke", ...scope, actorEntityId })}
    />
  );
}
