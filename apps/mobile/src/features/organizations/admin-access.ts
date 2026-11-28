export function isOrganizationAdmin(
  access: { organizationId: string } | null | undefined,
  organizationId: string,
) {
  return access?.organizationId === organizationId;
}
