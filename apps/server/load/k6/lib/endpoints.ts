/**
 * Every endpoint the load test calls. The key is the metric name in the summary. Add an entry
 * here before calling a new endpoint.
 *
 * - `workspace`: v1 route that takes the active `organizationId`; the wrapper adds it and
 *   unwraps `{ success, data }`.
 * - `user`: v1 route without an organization; unwrapped the same way.
 * - `auth`: Better Auth route; plain JSON.
 * - `write`: counts toward the write rate.
 */
type Method = "GET" | "POST" | "DELETE";
interface Endpoint {
  method: Method;
  path: string;
  scope: "workspace" | "user" | "auth";
  write?: true;
}

const workspace = (method: Method, path: string, write?: true): Endpoint => ({
  method,
  path: `/api/v1${path}`,
  scope: "workspace",
  write,
});

export const endpoints = {
  "auth.signIn": { method: "POST", path: "/api/auth/sign-in/email", scope: "auth" },
  "auth.signOut": { method: "POST", path: "/api/auth/sign-out", scope: "auth" },
  "auth.setActive": { method: "POST", path: "/api/auth/organization/set-active", scope: "auth" },
  "auth.fullOrganization": {
    method: "GET",
    path: "/api/auth/organization/get-full-organization",
    scope: "auth",
  },
  "auth.organizations": { method: "GET", path: "/api/auth/organization/list", scope: "auth" },
  "auth.listInvitations": {
    method: "GET",
    path: "/api/auth/organization/list-invitations",
    scope: "auth",
  },
  "auth.userInvitations": {
    method: "GET",
    path: "/api/auth/organization/list-user-invitations",
    scope: "auth",
  },
  "auth.updateUser": { method: "POST", path: "/api/auth/update-user", scope: "auth", write: true },
  "auth.updateOrganization": {
    method: "POST",
    path: "/api/auth/organization/update",
    scope: "auth",
    write: true,
  },
  "auth.inviteMember": {
    method: "POST",
    path: "/api/auth/organization/invite-member",
    scope: "auth",
    write: true,
  },
  "auth.cancelInvitation": {
    method: "POST",
    path: "/api/auth/organization/cancel-invitation",
    scope: "auth",
    write: true,
  },
  "auth.updateMemberRole": {
    method: "POST",
    path: "/api/auth/organization/update-member-role",
    scope: "auth",
    write: true,
  },
  session: { method: "GET", path: "/api/auth/get-session", scope: "auth" },
  "agents.list": { method: "POST", path: "/api/v1/agents/list", scope: "user" },

  "organizations.current": workspace("GET", "/organizations/current"),
  "organizations.people": workspace("GET", "/organizations/people"),

  "messaging.conversations": workspace("GET", "/messaging/conversations"),
  "messaging.conversations.create": workspace("POST", "/messaging/conversations", true),
  "messaging.conversations.join": workspace("POST", "/messaging/conversations/join", true),
  "messaging.conversations.leave": workspace("POST", "/messaging/conversations/leave", true),
  "messaging.conversations.delete": workspace("POST", "/messaging/conversations/delete", true),
  "messaging.conversations.owner": workspace("POST", "/messaging/conversations/owner", true),
  "messaging.conversations.managed": workspace("GET", "/messaging/conversations/managed"),
  "messaging.conversations.deleteImpact": workspace(
    "GET",
    "/messaging/conversations/delete-impact",
  ),
  "messaging.members.add": workspace("POST", "/messaging/members", true),
  "messaging.members.remove": workspace("POST", "/messaging/members/remove", true),
  "messaging.sharing.invite": workspace("POST", "/messaging/sharing/invite", true),
  "messaging.sharing.revoke": workspace("POST", "/messaging/sharing/revoke", true),
  "messaging.sharing.resend": workspace("POST", "/messaging/sharing/resend", true),
  "messaging.sharing.disconnect": workspace("POST", "/messaging/sharing/disconnect", true),
  "messaging.sharing.remove": workspace("POST", "/messaging/sharing/remove", true),
  "messaging.sharing.details": workspace("GET", "/messaging/sharing/details"),
  "messaging.sharing.conversations": workspace("GET", "/messaging/sharing/conversations"),
  "messaging.sharing.inbox": workspace("GET", "/messaging/sharing/inbox"),
  "messaging.sharing.invitation": {
    method: "GET",
    path: "/api/v1/messaging/sharing/invitation",
    scope: "user",
  },
  "messaging.sharing.accept": {
    method: "POST",
    path: "/api/v1/messaging/sharing/accept",
    scope: "user",
    write: true,
  },
  "messaging.sharing.decline": {
    method: "POST",
    path: "/api/v1/messaging/sharing/decline",
    scope: "user",
    write: true,
  },
  "messaging.profiles": workspace("GET", "/messaging/profiles"),
  "messaging.messages": workspace("GET", "/messaging/messages"),
  "messaging.messages.send": workspace("POST", "/messaging/messages", true),
  "messaging.messages.edit": workspace("POST", "/messaging/messages/edit", true),
  "messaging.messages.delete": workspace("POST", "/messaging/messages/delete", true),
  "messaging.reactions": workspace("GET", "/messaging/reactions"),
  "messaging.reactions.toggle": workspace("POST", "/messaging/reactions", true),
  "messaging.unread": workspace("GET", "/messaging/unread"),
  "messaging.read": workspace("POST", "/messaging/read"),

  "context.messagePage": workspace("POST", "/context/message-page"),
  "context.messageLinks": workspace("GET", "/context/message-links"),
  "context.messagePeople": workspace("GET", "/context/message-people"),
  "context.messageTarget": workspace("GET", "/context/message-target"),
  "context.related": workspace("GET", "/context/related"),
  "context.activity": workspace("GET", "/context/activity"),
  "context.search": workspace("POST", "/context/search"),
  "context.sourceTasks": workspace("POST", "/context/source-tasks", true),
  "context.links.attach": workspace("POST", "/context/links", true),
  "context.links.detach": workspace("DELETE", "/context/links", true),
  "context.notifications.unread": workspace("GET", "/context/notifications/unread"),
  "context.notifications.groups": workspace("GET", "/context/notifications/groups"),
  "context.notifications.events": workspace("GET", "/context/notifications/events"),
  "context.notifications.readGroup": workspace("POST", "/context/notifications/read-group"),
  "context.notifications.readAll": workspace("POST", "/context/notifications/read-all"),

  "tasks.projects": workspace("GET", "/tasks/projects"),
  "tasks.project": workspace("GET", "/tasks/project"),
  "tasks.taskLocation": workspace("GET", "/tasks/task-location"),
  "tasks.discussion": workspace("POST", "/tasks/discussion"),
  "tasks.mutations": workspace("POST", "/tasks/mutations", true),
  "files.taskAttachments": workspace("GET", "/files/attachments/tasks"),
  "files.taskAttachments.add": workspace("POST", "/files/attachments/tasks", true),
  "files.taskAttachments.remove": workspace("DELETE", "/files/attachments/tasks", true),
  // Raw routes (path parameter, byte body) go through lib/upload.ts, not call().
  "files.taskAttachmentContent": workspace("GET", "/files/attachments/tasks/content"),
  "files.messageAttachmentContent": workspace("GET", "/files/attachments/messages/content"),
  /** An <img> source: a 302 to storage, which is not followed. */
  "files.picture": { method: "GET", path: "/api/v1/files/pictures/:purpose/:owner", scope: "user" },
  "files.pictures.upload": {
    method: "POST",
    path: "/api/v1/files/pictures/:purpose",
    scope: "user",
    write: true,
  },
  "files.uploads": { method: "POST", path: "/api/v1/files/uploads", scope: "user", write: true },
  "files.uploads.complete": {
    method: "POST",
    path: "/api/v1/files/uploads/:id/complete",
    scope: "user",
    write: true,
  },

  "agentWork.needsYou": workspace("GET", "/agent-work/needs-you"),
  "agentWork.status": workspace("GET", "/agent-work/status"),
  "agentWork.requests": workspace("GET", "/agent-work/requests"),
  "agentWork.callsMine": workspace("GET", "/agent-work/calls/mine"),
} satisfies Record<string, Endpoint>;

export type EndpointName = keyof typeof endpoints;
// SAFETY: endpoints is a module-owned object; its own keys are exactly EndpointName.
export const endpointNames = Object.keys(endpoints) as EndpointName[];

/** Failure codes in the summary: service error codes, else the HTTP status class. */
export const failureCodes = [
  "INVALID_INPUT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "WORKSPACE_CHANGED",
  "NOT_FOUND",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL_ERROR",
  "HTTP_4XX",
  "HTTP_5XX",
  "NETWORK",
  "BAD_BODY",
] as const;
export type FailureCode = (typeof failureCodes)[number];
