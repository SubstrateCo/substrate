import type { MessageContextState } from "./message-context";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { linkedWorkLink, messageLink } from "@/lib/navigation/record-links";

export function ReferencedMessageBody({
  organizationId,
  context,
  body,
}: {
  organizationId: string;
  context: MessageContextState;
  body: string;
}) {
  const apps = useOrganizationApps();
  return (
    <MessageMarkdown
      body={body}
      referencesLoading={context.loading}
      references={[
        ...(context.error ? [] : (context.data?.messaging ?? [])).map((reference) => ({
          id: reference.id,
          kind: reference.kind,
          label: reference.title,
          link: messageLink(
            organizationId,
            reference.conversationId,
            reference.threadId ?? undefined,
          ),
        })),
        ...(context.error ? [] : (context.data?.links ?? []))
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
            link: linkedWorkLink(organizationId, link),
          })),
        ...(context.error ? [] : (context.data?.people ?? [])).map((person) => ({
          id: person.id,
          kind: "person" as const,
          label: person.name,
        })),
        ...(context.error ? [] : (context.data?.agents ?? [])).map((agent) => ({
          id: agent.id,
          kind: "agent" as const,
          label: agent.name,
        })),
      ]}
    />
  );
}
