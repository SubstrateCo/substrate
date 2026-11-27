import { permissionLabels } from "@substrate/contracts/access/levels";
import type { PermissionLevel } from "@substrate/contracts/tasks";

import { projectPermissionOptions, type ProjectDetail } from "../../types";
import { AccessRow } from "@/components/people/access-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const editable = canManage && !lastOwner;
  return (
    <AccessRow
      name={member.name}
      image={member.image}
      avatar={member.avatar}
      agent={member.type === "agent"}
      meta={
        <>
          {member.type === "agent" ? "Agent" : "Person"}
          {lastOwner && canManage && " · Only owner. Add another owner to change this."}
        </>
      }
      level={permissionLabels[member.level]}
      levelControl={
        editable ? (
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
              className="w-30"
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
        ) : undefined
      }
      disabled={pending}
      onRemove={editable ? onRemove : undefined}
    />
  );
}
