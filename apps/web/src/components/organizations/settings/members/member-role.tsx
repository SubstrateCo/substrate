import type { OrganizationRole } from "@substrate/contracts/auth/permissions";

import type { MemberRowData } from "./member-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { organizationRoles, primaryRole, roleLabel } from "@/lib/organizations/member-policy";

export function MemberRole({
  member,
  disabled,
  onRoleChange,
}: {
  member: MemberRowData;
  disabled: boolean;
  onRoleChange: (member: MemberRowData, role: OrganizationRole) => void;
}) {
  const role = primaryRole(member.role);
  if (!member.canChangeRole)
    return <span className="px-2.5 text-muted-foreground">{roleLabel(member.role)}</span>;
  return (
    <Select
      value={role}
      disabled={disabled}
      onValueChange={(value) => {
        const option = organizationRoles.find((candidate) => candidate.value === value);
        if (option && option.value !== role) onRoleChange(member, option.value);
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
  );
}
