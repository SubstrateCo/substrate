import { roles, type OrganizationRole } from "@substrate/contracts/auth/permissions";
import { invitableRoles, primaryRole as storedPrimaryRole } from "@substrate/contracts/auth/roles";

const roleOptions = {
  member: {
    label: "Member",
    description: "Works in the channels and projects they are added to.",
  },
  admin: {
    label: "Admin",
    description: "Manages settings and conversations, invites people, and can remove members.",
  },
  owner: {
    label: "Owner",
    description: "Full control, including invitations, roles, and other owners.",
  },
} satisfies Record<OrganizationRole, { label: string; description: string }>;

export const organizationRoles: readonly {
  value: OrganizationRole;
  label: string;
  description: string;
}[] = (["member", "admin", "owner"] as const).map((value) => ({ value, ...roleOptions[value] }));

/** The most powerful stored role, from the shared role parser. */
export function primaryRole(role: string): OrganizationRole {
  return storedPrimaryRole(role);
}

/** A human label for a stored role, such as "Admin". */
export function roleLabel(role: string) {
  return roleOptions[primaryRole(role)].label;
}

/** The role options the viewer may invite people with, from most to least common. */
export function invitationRoles(viewerRole: string) {
  const invitable = invitableRoles(viewerRole);
  return organizationRoles.filter((option) => invitable.includes(option.value));
}

/**
 * What the viewer may do to one member, so the UI hides actions that would fail. The shared role
 * permissions decide who may change roles and remove members. Two rules are local: nobody changes
 * or removes themselves here, and admins cannot remove owners. The server still enforces every
 * rule, including the last owner.
 */
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
