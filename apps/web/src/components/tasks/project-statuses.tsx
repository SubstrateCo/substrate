import { ProjectStatuses as ProjectStatusesView } from "@startup-os/ui/tasks/project-statuses";
import type { ProjectDetail } from "@startup-os/ui/tasks/types";
import { useTasksMutation } from "./use-tasks-mutation";

export function ProjectStatuses({
  organizationId,
  detail,
}: {
  organizationId: string;
  detail: ProjectDetail;
}) {
  const add = useTasksMutation(organizationId);
  return (
    <ProjectStatusesView
      detail={detail}
      pending={add.isPending}
      error={add.error}
      onAdd={(draft, onSuccess) =>
        add.mutate(
          {
            action: "addStatus",
            organizationId,
            projectEntityId: detail.project.entityId,
            ...draft,
          },
          { onSuccess },
        )
      }
    />
  );
}
