import { ProjectAccessForm } from "./project-sharing/project-access-form";
import { ProjectMembers } from "./project-sharing/project-members";
import type { ProjectDetail, ProjectPermission } from "./types";
import { FormMessage } from "@/components/auth/form-message";

export function ProjectSharing({
  detail,
  pending = false,
  error,
  onShare,
  onRevoke,
}: {
  detail: ProjectDetail;
  pending?: boolean;
  error?: Error | null;
  onShare: (actorEntityId: string, level: ProjectPermission) => void;
  onRevoke: (actorEntityId: string) => void;
}) {
  return (
    <section
      className="w-full min-w-0 space-y-4 rounded-xl border p-4"
      aria-label="Project sharing"
    >
      <h2 className="font-semibold">Project access</h2>
      <p className="text-sm text-muted-foreground">
        Shared access applies to every task, subtask, and comment in this project.
      </p>
      <ProjectMembers
        members={detail.members}
        canManage={detail.level === "owner"}
        pending={pending}
        onRevoke={onRevoke}
      />
      <ProjectAccessForm detail={detail} pending={pending} onShare={onShare} />
      <FormMessage error={error} />
    </section>
  );
}
