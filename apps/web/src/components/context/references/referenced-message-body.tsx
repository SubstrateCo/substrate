import type { MessageContextState } from "./message-context";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { workHref } from "@/lib/navigation/record-links";

export function ReferencedMessageBody({
  organizationId,
  context,
  body,
}: {
  organizationId: string;
  context: MessageContextState;
  body: string;
}) {
  return (
    <MessageMarkdown
      body={body}
      referencesLoading={context.loading}
      references={[
        ...(context.error ? [] : (context.data?.links ?? [])).map((link) => ({
          id: link.entityId,
          kind: link.entityType,
          label: link.title,
          href: workHref(
            organizationId,
            link.projectEntityId,
            link.entityType === "task" ? link.entityId : undefined,
          ),
        })),
        ...(context.error ? [] : (context.data?.people ?? [])).map((person) => ({
          id: person.id,
          kind: "person" as const,
          label: person.name,
        })),
      ]}
    />
  );
}
