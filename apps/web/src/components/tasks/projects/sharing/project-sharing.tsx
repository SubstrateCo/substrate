import type { PermissionLevel } from "@substrate/contracts/tasks";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import {
  ProjectSharing as ProjectSharingView,
  type AccessChange,
  type ErrorSurface,
} from "@/components/tasks/projects/sharing/project-sharing-view";
import type { ProjectDetail } from "@/components/tasks/types";
import { projectCapabilities } from "@/lib/tasks/project-capabilities";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { toast } from "sonner";

const outcomes: Record<PermissionLevel, string> = {
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
  const apply = (change: AccessChange, surface: ErrorSurface) =>
    share.mutate(
      { action: "share", ...scope, actorEntityId: change.actorEntityId, level: change.level },
      {
        onError: (error) => {
          if (surface.kind === "toast")
            toast.error(actionErrorMessage(error, "Couldn’t change access. Try again."));
        },
        onSuccess: () => {
          const { previous } = change;
          toast.success(`${change.name} ${outcomes[change.level]}.`, {
            action: previous && {
              label: "Undo",
              onClick: () =>
                apply({ ...change, level: previous, previous: undefined }, { kind: "toast" }),
            },
          });
          if (surface.kind === "dialog") surface.onSuccess();
        },
      },
    );
  return (
    <ProjectSharingView
      capabilities={projectCapabilities(detail.level, !!detail.project.archivedAt)}
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
