export const queryKeys = {
  session: ["auth", "session"] as const,
  agents: (userId: string) => ["users", userId, "agents"] as const,
  harnessModels: (userId: string, organizationId: string, harness: string, agentId?: string) =>
    ["users", userId, "harness-models", organizationId, harness, agentId ?? ""] as const,
  localAgentConfiguration: (
    userId: string,
    organizationId: string,
    agentId: string,
    harness: string,
  ) => ["users", userId, "local-agent-configuration", organizationId, agentId, harness] as const,
  context: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "context"] as const,
  messageTargets: (organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.context(organizationId),
      "target",
      ...(conversationId ? [conversationId] : []),
    ] as const,
  organizations: ["organizations", "list"] as const,
  userInvitations: ["invitations", "user"] as const,
  organization: (organizationId: string) => ["organizations", organizationId] as const,
  organizationDetail: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "detail"] as const,
  invitations: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "invitations"] as const,
  activeMember: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "active-member"] as const,
  invitation: (invitationId: string) => ["invitations", invitationId] as const,
  tasks: (organizationId: string) => [...queryKeys.organization(organizationId), "tasks"] as const,
  projects: (organizationId: string) => [...queryKeys.tasks(organizationId), "projects"] as const,
  project: (organizationId: string, projectEntityId: string) =>
    [...queryKeys.tasks(organizationId), "project", projectEntityId] as const,
  taskComments: (organizationId: string, projectEntityId: string, taskEntityId: string) =>
    [...queryKeys.tasks(organizationId), "comments", projectEntityId, taskEntityId] as const,
  messaging: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "messaging"] as const,
  conversations: (organizationId: string) =>
    [...queryKeys.messaging(organizationId), "conversations"] as const,
  messages: (organizationId: string, conversationId: string, threadId?: string) =>
    [...queryKeys.messaging(organizationId), "messages", conversationId, threadId ?? null] as const,
};
