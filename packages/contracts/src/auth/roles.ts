import { roles, type OrganizationRole } from "./permissions.ts";

const roleOrder = ["owner", "admin", "member"] as const satisfies readonly OrganizationRole[];

const isRole = (role: string): role is OrganizationRole => Object.hasOwn(roles, role);

/** Better Auth stores several roles as a comma-separated list. Unknown roles are ignored. */
export function storedRoles(role: string | null | undefined): OrganizationRole[] {
  return (role ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(isRole);
}

/** The most powerful stored role. A person without a known role is a member. */
export function primaryRole(role: string | null | undefined): OrganizationRole {
  const stored = storedRoles(role);
  return roleOrder.find((candidate) => stored.includes(candidate)) ?? "member";
}

/**
 * The roles the viewer may invite people with, most powerful first. Empty when the viewer may not
 * invite. Better Auth lets only owners invite owners, and enforces it.
 */
export function invitableRoles(viewerRole: string | null | undefined): OrganizationRole[] {
  const viewer = primaryRole(viewerRole);
  if (!roles[viewer].authorize({ invitation: ["create"] }).success) return [];
  return roleOrder.filter((role) => viewer === "owner" || role !== "owner");
}

/**
 * Who may share an invitation's link: the people who could send it. Only owners see or hand out
 * owner invitations.
 */
export function canShareInvitation(viewerRole: string, invitationRole: string | null) {
  const invitable = invitableRoles(viewerRole);
  return (
    invitable.length > 0 && storedRoles(invitationRole).every((role) => invitable.includes(role))
  );
}
