import type { OrganizationRole } from "@substrate/contracts/auth/permissions";

import { MemberRole } from "./member-role";
import { PersonAvatar } from "@/components/people/person-avatar";
import { createAppColumnHelper } from "@/components/table";
import { Timestamp } from "@/components/time/timestamp";
import { roleLabel } from "@/lib/organizations/member-policy";

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

const column = createAppColumnHelper<MemberRowData>();

/** The columns of the members table. Role changes go through `onRoleChange` for a confirm. */
export function memberColumns({
  disabled,
  onRoleChange,
}: {
  disabled: boolean;
  onRoleChange: (member: MemberRowData, role: OrganizationRole) => void;
}) {
  return column.columns([
    column.accessor("name", {
      header: "Member",
      meta: { controls: true },
      cell: ({ row: { original: member } }) => (
        <span className="flex min-w-0 items-center gap-2">
          <PersonAvatar name={member.name} image={member.image} />
          <span className="truncate font-medium" title={member.name}>
            {member.name}
            {member.self && <span className="font-normal text-muted-foreground"> (you)</span>}
          </span>
        </span>
      ),
    }),
    column.accessor("email", {
      header: "Email",
      cell: ({ getValue }) => (
        <span className="block truncate text-muted-foreground" title={getValue()}>
          {getValue()}
        </span>
      ),
    }),
    column.accessor("joinedAt", {
      header: "Joined",
      meta: { width: "w-28", hideBelow: "@3xl" },
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          <Timestamp value={getValue()} format="date" />
        </span>
      ),
    }),
    column.accessor((member) => roleLabel(member.role), {
      id: "role",
      header: "Role",
      meta: { width: "w-36", controls: true },
      cell: ({ row: { original: member } }) => (
        <MemberRole member={member} disabled={disabled} onRoleChange={onRoleChange} />
      ),
    }),
  ]);
}
