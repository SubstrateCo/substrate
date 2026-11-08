import { useState } from "react";

import { TaskSelect } from "../../task-select";
import type { ProjectDetail, ProjectPermission } from "../../types";
import { PendingButton } from "@/components/feedback/pending-button";
import { UserRound } from "lucide-react";

const permissionRank = { view: 0, comment: 1, edit: 2, owner: 3 };

export function ProjectMemberRow({
  member,
  canManage,
  lastOwner,
  pending,
  onShare,
  onReview,
}: {
  member: ProjectDetail["members"][number];
  canManage: boolean;
  lastOwner: boolean;
  pending: boolean;
  onShare: (actorEntityId: string, level: ProjectPermission) => void;
  onReview: (actorEntityId: string, name: string, level: ProjectPermission | null) => void;
}) {
  const [level, setLevel] = useState<ProjectPermission | "none">(member.level);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 flex-1 basis-36 items-center gap-3">
        <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium wrap-anywhere">{member.name}</p>
          <p className="text-xs text-muted-foreground">
            {member.type === "agent" ? "Agent" : "Person"} · Direct access
          </p>
        </div>
      </div>
      {canManage ? (
        <form
          className="flex max-w-full flex-wrap items-center justify-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || lastOwner || level === member.level) return;
            if (level === "none" || permissionRank[level] > permissionRank[member.level])
              onReview(member.actorEntityId, member.name, level === "none" ? null : level);
            else onShare(member.actorEntityId, level);
          }}
        >
          <TaskSelect
            compact
            label={`${member.name} permission`}
            value={level}
            onChange={setLevel}
            disabled={pending || lastOwner}
            options={[
              { value: "view", label: "View" },
              { value: "comment", label: "Comment" },
              { value: "edit", label: "Edit" },
              { value: "owner", label: "Owner" },
              { value: "none", label: "No access" },
            ]}
          />
          {lastOwner && <span className="text-xs text-muted-foreground">Last owner</span>}
          {level !== member.level && (
            <PendingButton size="sm" variant="outline" pending={pending} pendingLabel="Applying…">
              Apply
            </PendingButton>
          )}
        </form>
      ) : (
        <span className="text-sm capitalize">{member.level} access</span>
      )}
    </li>
  );
}
