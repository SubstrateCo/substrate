export type OrganizationRole = "owner" | "admin" | "member";

export const organizationRoles: readonly {
  value: OrganizationRole;
  label: string;
  description: string;
}[] = [
  {
    value: "member",
    label: "Member",
    description: "Works in the channels and projects they are added to.",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Manages settings and conversations, and can remove members.",
  },
  {
    value: "owner",
    label: "Owner",
    description: "Full control, including invitations, roles, and other owners.",
  },
];

const roleOrder: readonly OrganizationRole[] = ["owner", "admin", "member"];

/** Better Auth stores roles as a comma-separated list. Returns the most powerful one. */
export function primaryRole(role: string): OrganizationRole {
  const roles = role.split(",").map((value) => value.trim());
  return roleOrder.find((candidate) => roles.includes(candidate)) ?? "member";
}

/** A human label for a stored role, such as "Admin". */
export function roleLabel(role: string) {
  const primary = primaryRole(role);
  return organizationRoles.find((option) => option.value === primary)!.label;
}

/**
 * What the viewer may do to one member. This mirrors the server so the UI hides actions that
 * would fail: only owners change roles, nobody changes or removes themselves here, and admins
 * cannot remove owners. The server still enforces every rule, including the last owner.
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
  return {
    canChangeRole: !self && viewer === "owner",
    canRemove: !self && (viewer === "owner" || (viewer === "admin" && target !== "owner")),
  };
}
