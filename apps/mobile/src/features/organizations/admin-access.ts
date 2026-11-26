/**
 * The server answers for the session's active organization, or null for members. A stale answer
 * for another workspace does not make the viewer an admin here.
 */
export function isOrganizationAdmin(
  access: { organizationId: string } | null | undefined,
  organizationId: string,
) {
  return access?.organizationId === organizationId;
}
