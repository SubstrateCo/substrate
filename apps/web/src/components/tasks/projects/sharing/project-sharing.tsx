import {
  ProjectSharing as ProjectSharingView,
  type AccessChange,
} from "@/components/tasks/projects/sharing/project-sharing-view";
import type { ProjectDetail, ProjectPermission } from "@/components/tasks/types";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { toast } from "sonner";

const outcomes: Record<ProjectPermission, string> = {
  view: "can now view this project",
  comment: "can now comment on this project",
  edit: "can now edit this project",
  owner: "is now an owner",
};

export function ProjectSharing({
  organizationId,
  detail,
}: {
  organizationId: string;
  detail: ProjectDetail;
}) {
  const share = useTasksMutation(organizationId);
  const scope = { organizationId, projectEntityId: detail.project.entityId };
  const apply = (change: AccessChange, onSuccess?: () => void) =>
    share.mutate(
      { action: "share", ...scope, actorEntityId: change.actorEntityId, level: change.level },
      {
        onSuccess: () => {
          const { previous } = change;
          toast.success(`${change.name} ${outcomes[change.level]}.`, {
            action: previous && {
              label: "Undo",
              onClick: () => apply({ ...change, level: previous, previous: undefined }),
            },
          });
          onSuccess?.();
        },
      },
    );
  return (
    <ProjectSharingView
      detail={detail}
      pending={share.isPending}
      error={share.error}
      onClearError={() => share.reset()}
      onShare={apply}
      onRevoke={(actorEntityId, name, onSuccess) =>
        share.mutate(
          { action: "revoke", ...scope, actorEntityId },
          {
            onSuccess: () => {
              toast.success(`${name} no longer has access.`);
              onSuccess();
            },
          },
        )
      }
    />
  );
}
