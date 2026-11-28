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
import { actorIdentity, actorKindLabel } from "@/lib/actors/identity";

export function ProjectMemberRow(
  props: {
    member: ProjectDetail["members"][number];
    pending: boolean;
  } & (
    | { editable: true; onChange: (level: PermissionLevel) => void; onRemove: () => void }
    | {
        editable: false;
        note?: string;
      }
  ),
) {
  const { member, pending } = props;
  const actor = actorIdentity(member);
  return (
    <AccessRow
      actor={actor}
      meta={
        <>
          {actorKindLabel(actor)}
          {!props.editable && props.note && ` · ${props.note}`}
        </>
      }
      level={permissionLabels[member.level]}
      levelControl={
        props.editable ? (
          <Select
            value={member.level}
            disabled={pending}
            onValueChange={(next) => {
              const option = projectPermissionOptions.find((candidate) => candidate.value === next);
              if (option && option.value !== member.level) props.onChange(option.value);
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
      onRemove={props.editable ? props.onRemove : undefined}
    />
  );
}
