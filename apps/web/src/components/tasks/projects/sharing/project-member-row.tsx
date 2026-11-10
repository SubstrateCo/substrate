import { useId, useState } from "react";

import { projectPermissionOptions, type ProjectDetail, type ProjectPermission } from "../../types";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Trash2, UserRound } from "lucide-react";

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
  const [level, setLevel] = useState<ProjectPermission>(member.level);
  const labelId = useId();
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
            if (permissionRank[level] > permissionRank[member.level])
              onReview(member.actorEntityId, member.name, level);
            else onShare(member.actorEntityId, level);
          }}
        >
          {lastOwner && <span className="text-xs text-muted-foreground">Last owner</span>}
          {level !== member.level && (
            <PendingButton size="sm" variant="outline" pending={pending} pendingLabel="Applying…">
              Apply
            </PendingButton>
          )}
          <span id={labelId} className="sr-only">
            {member.name} permission
          </span>
          <ButtonGroup aria-label={`${member.name} access`}>
            <Select
              value={level}
              onValueChange={(next) => {
                const option = projectPermissionOptions.find(
                  (candidate) => candidate.value === next,
                );
                if (option) setLevel(option.value);
              }}
              disabled={pending || lastOwner}
            >
              <SelectTrigger size="compact" aria-labelledby={labelId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {projectPermissionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="destructive"
                  aria-label={`Remove ${member.name}’s access`}
                  disabled={pending || lastOwner}
                  onClick={() => onReview(member.actorEntityId, member.name, null)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove access</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </form>
      ) : (
        <span className="text-sm capitalize">{member.level} access</span>
      )}
    </li>
  );
}
