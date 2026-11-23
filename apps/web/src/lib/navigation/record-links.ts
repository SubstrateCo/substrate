import type { ContextTargetType } from "@substrate/contracts/context/input";
import type { CrmExport } from "@substrate/contracts/crm/export";

import { linkOptions } from "@tanstack/react-router";

import type { AgentPageSection } from "@/lib/agent-work/agent-sections";

/** A task opens in its project. Pass the link to `Link`, `navigate`, or `useRecordUrl`. */
export function workLink(organizationId: string, projectEntityId: string, taskEntityId?: string) {
  return linkOptions({
    to: "/tasks",
    search: { workspaceId: organizationId, projectId: projectEntityId, taskId: taskEntityId },
  });
}
/**
 * Open a readable record in its owning app; interactions open their contact's history. A meeting
 * opens on `date` (YYYY-MM-DD) when it is known, and otherwise on the calendar's default day.
 */
export function linkedWorkLink(
  organizationId: string,
  link: {
    projectEntityId: string | null;
    contactEntityId?: string | null;
    entityType: ContextTargetType;
    entityId: string;
    date?: string;
  },
  crmEnabled: boolean,
) {
  if (link.entityType === "account") return crmLink(organizationId, "accounts", link.entityId);
  if (link.entityType === "deal") return crmLink(organizationId, "deals", link.entityId);
  if (link.entityType === "contact") return personLink(organizationId, link.entityId, crmEnabled);
  if (link.entityType === "contact_interaction")
    return link.contactEntityId
      ? personLink(organizationId, link.contactEntityId, crmEnabled)
      : interactionLink(organizationId, link.entityId);
  if (link.entityType === "calendar_event")
    return calendarLink(organizationId, link.entityId, link.date);
  return workLink(
    organizationId,
    link.projectEntityId ?? link.entityId,
    link.entityType === "task" ? link.entityId : undefined,
  );
}
export function messageLink(organizationId: string, conversationId: string, messageId?: string) {
  return linkOptions({
    to: "/messages",
    search: { workspaceId: organizationId, conversationId, messageId },
  });
}

export function agentLink(organizationId: string, agentId: string, section?: AgentPageSection) {
  return linkOptions({
    to: "/agents",
    search: { workspaceId: organizationId, agentId, section },
  });
}

/** The calendar on an event's day, with the event open. `date` is YYYY-MM-DD. */
export function calendarLink(organizationId: string, eventId?: string, date?: string) {
  return linkOptions({
    to: "/calendar",
    search: { workspaceId: organizationId, eventId, date },
  });
}

export type RecordLink =
  | ReturnType<typeof calendarLink>
  | ReturnType<typeof crmLink>
  | ReturnType<typeof contactLink>
  | ReturnType<typeof workLink>
  | ReturnType<typeof messageLink>
  | ReturnType<typeof agentLink>
  | ReturnType<typeof interactionLink>
  | ReturnType<typeof interactionPersonLink>;

export function interactionLink(organizationId: string, recordId: string) {
  return linkOptions({ to: "/interactions", search: { workspaceId: organizationId, recordId } });
}

export function crmLink(organizationId: string, section: "accounts" | "deals", recordId?: string) {
  return linkOptions({ to: "/crm", search: { workspaceId: organizationId, section, recordId } });
}

export function contactLink(organizationId: string, recordId?: string) {
  return linkOptions({ to: "/contacts", search: { workspaceId: organizationId, recordId } });
}

/**
 * A person's profile in Interactions, which needs no optional app. It shows all time, because a
 * link from a record should show that record's interactions, however old.
 */
export function interactionPersonLink(organizationId: string, contactEntityId: string) {
  return linkOptions({
    to: "/interactions",
    search: {
      workspaceId: organizationId,
      section: "person",
      profileId: contactEntityId,
      days: "all",
    },
  });
}

/** A person opens in Contacts when CRM is on, and in their Interactions profile when it is off. */
export function personLink(organizationId: string, contactEntityId: string, crmEnabled: boolean) {
  return crmEnabled
    ? contactLink(organizationId, contactEntityId)
    : interactionPersonLink(organizationId, contactEntityId);
}

export function recordLink(organizationId: string, kind: CrmExport["kind"], recordId?: string) {
  return kind === "contacts"
    ? contactLink(organizationId, recordId)
    : crmLink(organizationId, kind, recordId);
}
