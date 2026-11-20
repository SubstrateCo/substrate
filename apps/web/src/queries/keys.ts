import type { NotificationFilter } from "@substrate/contracts/context/notification-groups";

import { partialMatchKey, type QueryKey } from "@tanstack/react-query";

export const queryKeys = {
  messageUnread: (organizationId: string) =>
    [...queryKeys.messaging(organizationId), "unread"] as const,
  desktopRelease: ["desktop", "release"] as const,
  desktopSettings: ["desktop", "settings"] as const,
  sharingInvitations: ["sharing-invitations"] as const,
  session: ["auth", "session"] as const,
  // Private to one user. Each key names a kind, then the organization when it has one.
  user: (userId: string) => ["users", userId] as const,
  agents: (userId: string) => [...queryKeys.user(userId), "agents"] as const,
  // Harness reads go through the desktop bridge. Each kind is a prefix, so isHarnessKey can match.
  allHarnessModels: (userId: string) => [...queryKeys.user(userId), "harness-models"] as const,
  harnessModels: (userId: string, organizationId: string, harness: string, agentId?: string) =>
    [...queryKeys.allHarnessModels(userId), organizationId, harness, agentId ?? ""] as const,
  allHarnessStatus: (userId: string) => [...queryKeys.user(userId), "harness-status"] as const,
  allHarnessSignIns: (userId: string) => [...queryKeys.user(userId), "harness-sign-in"] as const,
  harnessSignIn: (userId: string, organizationId: string, loginId: string) =>
    [...queryKeys.allHarnessSignIns(userId), organizationId, loginId] as const,
  harnessStatus: (userId: string, organizationId: string) =>
    [...queryKeys.allHarnessStatus(userId), organizationId] as const,
  localAgentConfigurations: (userId: string) =>
    [...queryKeys.user(userId), "local-agent-configuration"] as const,
  localAgentConfiguration: (
    userId: string,
    organizationId: string,
    agentId: string,
    harness: string,
  ) => [...queryKeys.localAgentConfigurations(userId), organizationId, agentId, harness] as const,
  // Owner work and the caller's own call status are private, so they live under the user.
  agentWork: (userId: string, organizationId?: string) =>
    [...queryKeys.user(userId), "agent-work", ...(organizationId ? [organizationId] : [])] as const,
  // Server: requests and status that every owner device can read.
  agentWorkStatus: (userId: string, organizationId: string) =>
    [...queryKeys.agentWork(userId, organizationId), "status"] as const,
  agentWorkNeedsYou: (userId: string, organizationId: string) =>
    [...queryKeys.agentWork(userId, organizationId), "needs-you"] as const,
  agentCallers: (userId: string, organizationId: string, agentId: string) =>
    [...queryKeys.agentWork(userId, organizationId), "callers", agentId] as const,
  agentCallsLog: (userId: string, organizationId: string, agentId: string) =>
    [...queryKeys.agentWork(userId, organizationId), "calls", agentId] as const,
  myAgentCalls: (userId: string, organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.agentWork(userId, organizationId),
      "my-calls",
      ...(conversationId ? [conversationId] : []),
    ] as const,
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
  relatedEntityId: (queryKey: readonly unknown[]) => queryKey[queryKeys.related("").length],
  activity: (organizationId: string, entityId?: string) =>
    [...queryKeys.context(organizationId), "activity", ...(entityId ? [entityId] : [])] as const,
  // A page key ends with the IDs of its messages.
  messagePages: (organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.context(organizationId),
      "message-pages",
      ...(conversationId ? [conversationId] : []),
    ] as const,
  messagePage: (organizationId: string, conversationId: string, messageIds: string[]) =>
    [...queryKeys.messagePages(organizationId, conversationId), messageIds] as const,
  messagePageIds: (queryKey: readonly unknown[]): unknown[] => {
    const ids = queryKey[queryKeys.messagePages("organization", "conversation").length];
    return Array.isArray(ids) ? ids : [];
  },
  notifications: (organizationId: string) =>
    [...queryKeys.context(organizationId), "notifications"] as const,
  notificationUnread: (organizationId: string) =>
    [...queryKeys.notifications(organizationId), "unread-status"] as const,
  notificationGroups: (organizationId: string, filter: NotificationFilter) =>
    [...queryKeys.notifications(organizationId), "groups", filter] as const,
  // Without a group key, every group's events.
  notificationEvents: (organizationId: string, groupKey?: string) =>
    [
      ...queryKeys.notifications(organizationId),
      "events",
      ...(groupKey ? [groupKey] : []),
    ] as const,
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
  // The summary and people sit under the detail key, so every detail refresh refreshes them too.
  organizationSummary: (organizationId: string) =>
    [...queryKeys.organizationDetail(organizationId), "summary"] as const,
  organizationPeople: (organizationId: string) =>
    [...queryKeys.organizationDetail(organizationId), "people"] as const,
  invitations: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "invitations"] as const,
  invitation: (invitationId: string) => ["invitations", invitationId] as const,
  tasks: (organizationId: string) => [...queryKeys.organization(organizationId), "tasks"] as const,
  crm: (organizationId: string) => [...queryKeys.organization(organizationId), "crm"] as const,
  contacts: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "contacts"] as const,
  contactInteractions: (organizationId: string) =>
    [...queryKeys.context(organizationId), "contact-interactions"] as const,
  crmList: (
    organizationId: string,
    kind: string,
    search: string,
    archived: boolean,
    afterEntityId?: string,
  ) =>
    [
      ...queryKeys.crm(organizationId),
      kind,
      "list",
      search,
      archived,
      afterEntityId ?? "",
    ] as const,
  crmRecord: (organizationId: string, kind: string, entityId: string) =>
    [...queryKeys.crm(organizationId), kind, entityId] as const,
  crmPipeline: (organizationId: string) => [...queryKeys.crm(organizationId), "pipeline"] as const,
  crmActivity: (organizationId: string, entityId: string) =>
    [...queryKeys.crm(organizationId), "activity", entityId] as const,
  projects: (organizationId: string) => [...queryKeys.tasks(organizationId), "projects"] as const,
  // Every cached project detail.
  projectDetails: (organizationId: string) =>
    [...queryKeys.tasks(organizationId), "project"] as const,
  project: (organizationId: string, projectEntityId: string) =>
    [...queryKeys.projectDetails(organizationId), projectEntityId] as const,
  projectEntityId: (queryKey: readonly unknown[]) => queryKey[queryKeys.projectDetails("").length],
  taskLocation: (organizationId: string, taskEntityId: string) =>
    [...queryKeys.tasks(organizationId), "location", taskEntityId] as const,
  taskAttachments: (organizationId: string, projectEntityId: string, taskEntityId: string) =>
    [...queryKeys.tasks(organizationId), "attachments", projectEntityId, taskEntityId] as const,
  messaging: (organizationId: string) =>
    [...queryKeys.organization(organizationId), "messaging"] as const,
  conversations: (organizationId: string) =>
    [...queryKeys.messaging(organizationId), "conversations"] as const,
  conversationList: (organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.conversations(organizationId),
      ...(conversationId ? ["selected", conversationId] : []),
    ] as const,
  // Nested under conversations, so conversation refreshes also refresh these.
  managedConversations: (organizationId: string) =>
    [...queryKeys.conversations(organizationId), "managed"] as const,
  // Without a conversation, the list of conversations shared with other workspaces.
  conversationSharing: (organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.conversations(organizationId),
      "sharing",
      ...(conversationId ? [conversationId] : []),
    ] as const,
  sharingInbox: (organizationId: string) =>
    [...queryKeys.messaging(organizationId), "sharing-inbox"] as const,
  deleteImpact: (organizationId: string, conversationId: string) =>
    [...queryKeys.conversations(organizationId), "delete-impact", conversationId] as const,
  messagingProfiles: (organizationId: string) =>
    [...queryKeys.messaging(organizationId), "profiles"] as const,
  messagingProfile: (organizationId: string, conversationId: string, actorId: string) =>
    [...queryKeys.messagingProfiles(organizationId), conversationId, actorId] as const,
  // Every thread and history page of one conversation, or of the whole workspace.
  conversationMessages: (organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.messaging(organizationId),
      "messages",
      ...(conversationId ? [conversationId] : []),
    ] as const,
  messages: (organizationId: string, conversationId: string, threadId?: string) =>
    [...queryKeys.conversationMessages(organizationId, conversationId), threadId ?? null] as const,
  conversationReactions: (organizationId: string, conversationId?: string) =>
    [
      ...queryKeys.messaging(organizationId),
      "reactions",
      ...(conversationId ? [conversationId] : []),
    ] as const,
  messageReactions: (organizationId: string, conversationId: string, messageId: string) =>
    [...queryKeys.conversationReactions(organizationId, conversationId), messageId] as const,
};

/** Whether a key holds a desktop harness read of this user. */
export function isHarnessKey(queryKey: QueryKey, userId: string) {
  return [
    queryKeys.allHarnessStatus(userId),
    queryKeys.allHarnessModels(userId),
    queryKeys.localAgentConfigurations(userId),
    queryKeys.allHarnessSignIns(userId),
  ].some((prefix) => partialMatchKey(queryKey, prefix));
}

/** The organization of one of this user's private keys, which follows the key's kind. */
export function userKeyOrganization(queryKey: QueryKey, userId: string) {
  const user = queryKeys.user(userId);
  return partialMatchKey(queryKey, user) ? queryKey[user.length + 1] : undefined;
}
