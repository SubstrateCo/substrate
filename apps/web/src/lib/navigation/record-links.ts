export function workHref(organizationId: string, projectEntityId: string, taskEntityId?: string) {
  const query = new URLSearchParams({ workspaceId: organizationId, projectId: projectEntityId });
  if (taskEntityId) query.set("taskId", taskEntityId);
  return `/tasks?${query}`;
}
/** A linked task opens in its project; a linked project opens itself. */
export function linkedWorkHref(
  organizationId: string,
  link: { projectEntityId: string; entityType: "task" | "project"; entityId: string },
) {
  return workHref(
    organizationId,
    link.projectEntityId,
    link.entityType === "task" ? link.entityId : undefined,
  );
}
export function messageHref(organizationId: string, conversationId: string, messageId?: string) {
  const query = new URLSearchParams({ workspaceId: organizationId, conversationId });
  if (messageId) query.set("messageId", messageId);
  return `/dashboard?${query}`;
}
