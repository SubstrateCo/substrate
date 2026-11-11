import { actionErrorMessage } from "@/components/feedback/action-error-message";
import {
  ProjectSharing as ProjectSharingView,
  type AccessChange,
} from "@/components/tasks/projects/sharing/project-sharing-view";
import type { ProjectDetail, ProjectPermission } from "@/components/tasks/types";
import { projectCapabilities } from "@/lib/tasks/project-capabilities";
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
  // A change without `onSuccess` comes from a member row or an Undo, with no dialog to show the
  // error, so it fails in a toast.
  const apply = (change: AccessChange, onSuccess?: () => void) =>
    share.mutate(
      { action: "share", ...scope, actorEntityId: change.actorEntityId, level: change.level },
      {
        onError: (error) => {
          if (!onSuccess)
            toast.error(actionErrorMessage(error, "Couldn’t change access. Try again."));
        },
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
      capabilities={projectCapabilities(detail.level)}
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
