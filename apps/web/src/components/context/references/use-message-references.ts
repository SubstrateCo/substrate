import type { MessageContextState } from "./message-context";
import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { linkedWorkLink, messageLink } from "@/lib/navigation/record-links";

export function useMessageReferences(context: MessageContextState): WorkspaceReference[] {
  const { organizationId } = useWorkspaceScope();
  const apps = useOrganizationApps();
  if (context.error) return [];
  return [
    ...(context.data?.messaging ?? []).map((reference) => ({
      id: reference.id,
      kind: reference.kind,
      label: reference.title,
      link: messageLink(organizationId, reference.conversationId, reference.threadId ?? undefined),
    })),
    ...(context.data?.links ?? [])
      .filter(
        (link) =>
          apps.entityEnabled(link.entityType) &&
          (link.entityType === "task" || link.entityType === "project"),
      )
      .map((link) => ({
        id: link.entityId,
        kind: link.entityType === "task" ? ("task" as const) : ("project" as const),
        label: link.title,
        status:
          link.status && link.statusName
            ? { value: link.status, label: link.statusName }
            : undefined,
        link: linkedWorkLink(organizationId, link, apps.enabled("crm")),
      })),
    ...(context.data?.people ?? []).map((person) => ({
      id: person.id,
      kind: "person" as const,
      label: person.name,
    })),
    ...(context.data?.agents ?? []).map((agent) => ({
      id: agent.id,
      kind: "agent" as const,
      label: agent.name,
    })),
  ];
}
