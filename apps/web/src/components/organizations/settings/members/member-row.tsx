import { PersonAvatar } from "@/components/people/person-avatar";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
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
    <li className="group/member flex min-w-0 items-center gap-3 px-4 py-2.5 hover:bg-row-hover">
      <PersonAvatar name={member.name} image={member.image} className="data-[size=sm]:size-8" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.name}
          {member.self && <span className="font-normal text-muted-foreground"> (you)</span>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{member.email}</p>
      </div>
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
          <SelectTrigger size="sm" className="w-28" aria-label={`Role for ${member.name}`}>
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
      {/* Remove stays hidden until the row is hovered or focused; touch screens always show it. */}
      <div className="flex w-7 shrink-0 justify-end opacity-0 transition-opacity duration-150 group-focus-within/member:opacity-100 group-hover/member:opacity-100 pointer-coarse:opacity-100">
        {member.canRemove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="destructive-ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={`Remove ${member.name}`}
                onClick={onRemove}
              >
                <UserMinus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove from organization</TooltipContent>
          </Tooltip>
        )}
      </div>
    </li>
  );
}
