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
/** Open a readable record in its owning app; interactions open their contact's history. */
export function linkedWorkLink(
  organizationId: string,
  link: {
    projectEntityId: string | null;
    contactEntityId?: string | null;
    entityType: "task" | "project" | "contact" | "account" | "deal" | "contact_interaction";
    entityId: string;
  },
) {
  if (link.entityType === "account") return crmLink(organizationId, "accounts", link.entityId);
  if (link.entityType === "deal") return crmLink(organizationId, "deals", link.entityId);
  if (link.entityType === "contact") return contactLink(organizationId, link.entityId);
  if (link.entityType === "contact_interaction")
    return contactLink(organizationId, link.contactEntityId ?? undefined);
  return workLink(
    organizationId,
    link.projectEntityId ?? link.entityId,
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
  | ReturnType<typeof crmLink>
  | ReturnType<typeof contactLink>
  | ReturnType<typeof workLink>
  | ReturnType<typeof messageLink>
  | ReturnType<typeof agentLink>;

export function crmLink(organizationId: string, section: "accounts" | "deals", recordId?: string) {
  return linkOptions({ to: "/crm", search: { workspaceId: organizationId, section, recordId } });
}

export function contactLink(organizationId: string, recordId?: string) {
  return linkOptions({ to: "/contacts", search: { workspaceId: organizationId, recordId } });
}

export function recordLink(
  organizationId: string,
  kind: "accounts" | "contacts" | "deals",
  recordId?: string,
) {
  return kind === "contacts"
    ? contactLink(organizationId, recordId)
    : crmLink(organizationId, kind, recordId);
}
