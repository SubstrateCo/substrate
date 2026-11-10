export const queryKeys = {
  desktopRelease: ["desktop", "release"] as const,
  desktopSettings: ["desktop", "settings"] as const,
  sharingInvitations: ["sharing-invitations"] as const,
  session: ["auth", "session"] as const,
  agents: (userId: string) => ["users", userId, "agents"] as const,
  harnessModels: (userId: string, organizationId: string, harness: string, agentId?: string) =>
    ["users", userId, "harness-models", organizationId, harness, agentId ?? ""] as const,
  harnessStatus: (userId: string, organizationId: string) =>
    ["users", userId, "harness-status", organizationId] as const,
  localAgentConfiguration: (
    userId: string,
    organizationId: string,
    agentId: string,
    harness: string,
  ) => ["users", userId, "local-agent-configuration", organizationId, agentId, harness] as const,
  // Agent work is private to the agent's owner, so it lives under the user.
  agentWork: (userId: string, organizationId?: string) =>
    ["users", userId, "agent-work", ...(organizationId ? [organizationId] : [])] as const,
  // Server: requests and status that every owner device can read.
  agentWorkStatus: (userId: string, organizationId: string) =>
    [...queryKeys.agentWork(userId, organizationId), "status"] as const,
  agentWorkNeedsYou: (userId: string, organizationId: string) =>
    [...queryKeys.agentWork(userId, organizationId), "needs-you"] as const,
  agentWorkRequests: (userId: string, organizationId: string, conversationId: string) =>
    [...queryKeys.agentWork(userId, organizationId), "requests", conversationId] as const,
  // Local: what the home desktop's bridge returns. Only that desktop has it.
  agentWorkLocal: (userId: string, organizationId: string) =>
    [...queryKeys.agentWork(userId, organizationId), "local"] as const,
  agentWorkAgents: (userId: string, organizationId: string) =>
    [...queryKeys.agentWorkLocal(userId, organizationId), "agents"] as const,
  agentWorkConversations: (userId: string, organizationId: string) =>
    [...queryKeys.agentWorkLocal(userId, organizationId), "conversation"] as const,
  agentWorkConversation: (userId: string, organizationId: string, conversationId: string) =>
    [...queryKeys.agentWorkConversations(userId, organizationId), conversationId] as const,
  agentWorkActivity: (userId: string, organizationId: string, agentId: string) =>
    [...queryKeys.agentWorkLocal(userId, organizationId), "activity", agentId] as const,
  agentWorkTurnEvents: (userId: string, organizationId: string, turnId: string) =>
    [...queryKeys.agentWorkLocal(userId, organizationId), "turn", turnId] as const,
  // Under the turn's events key, so a change hint for the turn refreshes both.
  agentWorkTurn: (userId: string, organizationId: string, turnId: string) =>
    [...queryKeys.agentWorkTurnEvents(userId, organizationId, turnId), "view"] as const,
  agentWorkRoutines: (userId: string, organizationId: string, agentId: string) =>
    [...queryKeys.agentWorkLocal(userId, organizationId), "routines", agentId] as const,
  context: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "context"] as const,
  messageTargets: (organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.context(organizationId),
      "target",
      ...(conversationId ? [conversationId] : []),
    ] as const,
  related: (organizationId: string, entityId?: string) =>
    [...queryKeys.context(organizationId), "related", ...(entityId ? [entityId] : [])] as const,
  // Reads the entity ID back from a related key, so predicates do not count positions.
  relatedEntityId: (queryKey: readonly unknown[]) => queryKey[4],
  activity: (organizationId: string, entityId?: string) =>
    [...queryKeys.context(organizationId), "activity", ...(entityId ? [entityId] : [])] as const,
  // A page key ends with the IDs of its messages.
  messagePages: (organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.context(organizationId),
      "message-pages",
      ...(conversationId ? [conversationId] : []),
    ] as const,
  messagePageIds: (queryKey: readonly unknown[]): unknown[] =>
    Array.isArray(queryKey[5]) ? queryKey[5] : [],
  notifications: (organizationId: string) =>
    [...queryKeys.context(organizationId), "notifications"] as const,
  notificationPages: (organizationId: string) =>
    [...queryKeys.notifications(organizationId), "page"] as const,
  search: (organizationId: string) => [...queryKeys.context(organizationId), "search"] as const,
  searchPages: (organizationId: string) =>
    [...queryKeys.context(organizationId), "search-pages"] as const,
  searches: (organizationId: string) =>
    [queryKeys.search(organizationId), queryKeys.searchPages(organizationId)] as const,
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
  // Nested under conversations, so conversation refreshes also refresh these.
  managedConversations: (organizationId: string) =>
    [...queryKeys.conversations(organizationId), "managed"] as const,
  deleteImpact: (organizationId: string, conversationId: string) =>
    [...queryKeys.conversations(organizationId), "delete-impact", conversationId] as const,
  messagingProfile: (organizationId: string, conversationId: string, actorId: string) =>
    [...queryKeys.messaging(organizationId), "profiles", conversationId, actorId] as const,
  // Every thread and history page of one conversation, or of the whole workspace.
  conversationMessages: (organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.messaging(organizationId),
      "messages",
      ...(conversationId ? [conversationId] : []),
    ] as const,
  messages: (organizationId: string, conversationId: string, threadId?: string) =>
    [...queryKeys.messaging(organizationId), "messages", conversationId, threadId ?? null] as const,
  conversationReactions: (organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.messaging(organizationId),
      "reactions",
      ...(conversationId ? [conversationId] : []),
    ] as const,
  messageReactions: (organizationId: string, conversationId: string, messageId: string) =>
    [...queryKeys.conversationReactions(organizationId, conversationId), messageId] as const,
};
