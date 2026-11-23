import type { PermissionLevel } from "@substrate/contracts/tasks";

import { useId } from "react";

import { projectPermissionLabels, projectPermissionOptions, type ProjectDetail } from "../../types";
import { actionRow, RowAction, RowActions } from "@/components/layout/row-actions";
import { PersonAvatar } from "@/components/people/person-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";
import { UserMinus } from "lucide-react";

/**
 * One person with project access. Owners change the level from the menu and remove access with
 * the row's remove button. The last owner stays fixed so the project always has one.
 */
export function ProjectMemberRow({
  member,
  canManage,
  lastOwner,
  pending,
  onChange,
  onRemove,
}: {
  member: ProjectDetail["members"][number];
  canManage: boolean;
  lastOwner: boolean;
  pending: boolean;
  onChange: (level: PermissionLevel) => void;
  onRemove: () => void;
}) {
  const labelId = useId();
  const editable = canManage && !lastOwner;
  return (
    <li className={cn(actionRow, "flex min-h-12 items-center gap-3 px-5 py-2")}>
      <PersonAvatar name={member.name} image={member.image} agent={member.type === "agent"} />
      <div className="min-w-0 flex-1">
        <p id={labelId} className="truncate text-sm font-medium">
          {member.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {member.type === "agent" ? "Agent" : "Person"}
          {lastOwner && canManage && " · Only owner. Add another owner to change this."}
        </p>
      </div>
      {editable ? (
        <>
          <Select
            value={member.level}
            disabled={pending}
            onValueChange={(next) => {
              const option = projectPermissionOptions.find((candidate) => candidate.value === next);
              if (option && option.value !== member.level) onChange(option.value);
            }}
          >
            <SelectTrigger
              size="sm"
              variant="ghost"
              aria-label={`${member.name} permission`}
              className="w-30 justify-end"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {projectPermissionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RowActions label={`Actions for ${member.name}`}>
            <RowAction
              label={`Remove ${member.name}’s access`}
              destructive
              disabled={pending}
              onClick={onRemove}
            >
              <UserMinus aria-hidden="true" />
            </RowAction>
          </RowActions>
        </>
      ) : (
        <>
          <span className="w-30 shrink-0 pr-2 text-right text-sm text-muted-foreground">
            {projectPermissionLabels[member.level]}
          </span>
          <span className="w-7 shrink-0" />
        </>
      )}
    </li>
  );
}
