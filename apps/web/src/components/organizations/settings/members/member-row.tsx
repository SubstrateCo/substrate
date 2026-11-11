import { actionRow, RowAction, RowActions } from "@/components/layout/row-actions";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Timestamp } from "@/components/time/timestamp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  organizationRoles,
  primaryRole,
  roleLabel,
  type OrganizationRole,
} from "@/lib/organizations/member-policy";
import { cn } from "cn";
import { UserMinus } from "lucide-react";

export type MemberRowData = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
  joinedAt: Date | string;
  self: boolean;
  canChangeRole: boolean;
  canRemove: boolean;
};

export function MemberRow({
  member,
  disabled,
  onRoleChange,
  onRemove,
}: {
  member: MemberRowData;
  disabled: boolean;
  onRoleChange: (role: OrganizationRole) => void;
  onRemove: () => void;
}) {
  const role = primaryRole(member.role);
  return (
    <li className={cn(actionRow, "flex min-w-0 items-center gap-3 px-4 py-2.5 hover:bg-row-hover")}>
      <PersonAvatar name={member.name} image={member.image} className="data-[size=sm]:size-8" />

      <Tooltip>
        <TooltipTrigger asChild>
          <div
            tabIndex={0}
            className="min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <p className="truncate text-sm font-medium" title={member.name}>
              {member.name}
              {member.self && <span className="font-normal text-muted-foreground"> (you)</span>}
            </p>
            <p className="truncate text-sm text-muted-foreground" title={member.email}>
              {member.email}
            </p>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <span className="block">{member.name}</span>
          <span className="block">{member.email}</span>
        </TooltipContent>
      </Tooltip>
      <span className="hidden text-sm text-muted-foreground @lg:inline">
        Joined <Timestamp value={member.joinedAt} format="date" />
      </span>
      {member.canChangeRole ? (
        <Select
          value={role}
          disabled={disabled}
          onValueChange={(value) => {
            const option = organizationRoles.find((candidate) => candidate.value === value);
            if (option && option.value !== role) onRoleChange(option.value);
          }}
        >
          <SelectTrigger
            variant="ghost"
            size="sm"
            className="w-28"
            aria-label={`Role for ${member.name}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {organizationRoles.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="w-28 px-2.5 text-sm text-muted-foreground">{roleLabel(member.role)}</span>
      )}
      {/* The slot keeps its width so the columns line up when someone can't be removed. */}
      <RowActions label={`Actions for ${member.name}`} className="w-7 justify-end">
        {member.canRemove && (
          <RowAction
            label={`Remove ${member.name}`}
            destructive
            disabled={disabled}
            onClick={onRemove}
          >
            <UserMinus aria-hidden="true" />
          </RowAction>
        )}
      </RowActions>
    </li>
  );
}
