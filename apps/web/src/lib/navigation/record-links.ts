export function workHref(organizationId: string, projectEntityId: string, taskEntityId?: string) {
  const query = new URLSearchParams({ workspaceId: organizationId, projectId: projectEntityId });
  if (taskEntityId) query.set("taskId", taskEntityId);
  return `/tasks?${query}`;
}
export function messageHref(organizationId: string, conversationId: string, messageId?: string) {
  const query = new URLSearchParams({ workspaceId: organizationId, conversationId });
  if (messageId) query.set("messageId", messageId);
  return `/dashboard?${query}`;
}
