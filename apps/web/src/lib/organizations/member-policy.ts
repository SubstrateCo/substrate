import { roles, type OrganizationRole } from "@substrate/contracts/auth/permissions";
import {
  invitableRoles,
  primaryRole as storedPrimaryRole,
  roleLabel as storedRoleLabel,
} from "@substrate/contracts/auth/roles";

const roleDescriptions = {
  member: "Works in the channels and projects they are added to.",
  admin: "Manages settings and conversations, invites people, and can remove members.",
  owner: "Full control, including invitations, roles, and other owners.",
} satisfies Record<OrganizationRole, string>;

export const organizationRoles: readonly {
  value: OrganizationRole;
  label: string;
  description: string;
}[] = (["member", "admin", "owner"] as const).map((value) => ({
  value,
  label: storedRoleLabel(value),
  description: roleDescriptions[value],
}));

export function primaryRole(role: string): OrganizationRole {
  return storedPrimaryRole(role);
}

export function roleLabel(role: string) {
  return storedRoleLabel(role);
}

export function invitationRoles(viewerRole: string) {
  const invitable = invitableRoles(viewerRole);
  return organizationRoles.filter((option) => invitable.includes(option.value));
}

export function memberActions({
  viewerRole,
  viewerUserId,
  memberRole,
  memberUserId,
}: {
  viewerRole: string;
  viewerUserId: string;
  memberRole: string;
  memberUserId: string;
}) {
  const viewer = primaryRole(viewerRole);
  const self = viewerUserId === memberUserId;
  const target = primaryRole(memberRole);
  const can = (action: "update" | "delete") =>
    roles[viewer].authorize({ member: [action] }).success;
  return {
    canChangeRole: !self && can("update"),
    canRemove: !self && can("delete") && !(viewer === "admin" && target === "owner"),
  };
}
