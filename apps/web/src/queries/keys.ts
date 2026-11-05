export const queryKeys = {
  session: ["auth", "session"] as const,
  organizations: ["organizations", "list"] as const,
  organization: (organizationId: string) => ["organizations", organizationId] as const,
  organizationDetail: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "detail"] as const,
  invitations: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "invitations"] as const,
  activeMember: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "active-member"] as const,
  invitation: (invitationId: string) => ["invitations", invitationId] as const,
};
