import { linkOptions } from "@tanstack/react-router";

import type { agentPageSections } from "@/components/agent-work/app/agent-sections";

type AgentPageSection = (typeof agentPageSections)[number];

/** A task opens in its project. Pass the link to `Link`, `navigate`, or `useRecordUrl`. */
export function workLink(organizationId: string, projectEntityId: string, taskEntityId?: string) {
  return linkOptions({
    to: "/tasks",
    search: { workspaceId: organizationId, projectId: projectEntityId, taskId: taskEntityId },
  });
}
/** A linked task opens in its project; a linked project opens itself. */
export function linkedWorkLink(
  organizationId: string,
  link: { projectEntityId: string; entityType: "task" | "project"; entityId: string },
) {
  return workLink(
    organizationId,
    link.projectEntityId,
    link.entityType === "task" ? link.entityId : undefined,
  );
}
export function messageLink(organizationId: string, conversationId: string, messageId?: string) {
  return linkOptions({
    to: "/dashboard",
    search: { workspaceId: organizationId, conversationId, messageId },
  });
}

export function agentLink(organizationId: string, agentId: string, section?: AgentPageSection) {
  return linkOptions({
    to: "/agents",
    search: { workspaceId: organizationId, agentId, section },
  });
}

export type RecordLink =
  | ReturnType<typeof workLink>
  | ReturnType<typeof messageLink>
  | ReturnType<typeof agentLink>;
