import { useQuery } from "@tanstack/react-query";

import { workHref } from "@/lib/context-links";
import { messageLinksOptions, messagePeopleOptions } from "@/queries/context/options";
import { MessageMarkdown } from "@/ui/messaging/message-markdown";

export function ReferencedMessageBody({
  organizationId,
  messageId,
  body,
}: {
  organizationId: string;
  messageId: string;
  body: string;
}) {
  const links = useQuery(messageLinksOptions(organizationId, messageId));
  const people = useQuery({
    ...messagePeopleOptions(organizationId, messageId),
    enabled: body.includes("@[person:"),
  });
  return (
    <MessageMarkdown
      body={body}
      referencesLoading={links.isPending || (body.includes("@[person:") && people.isPending)}
      references={[
        ...(links.error ? [] : (links.data ?? [])).map((link) => ({
          id: link.entityId,
          kind: link.entityType,
          label: link.title,
          href: workHref(
            organizationId,
            link.projectEntityId,
            link.entityType === "task" ? link.entityId : undefined,
          ),
        })),
        ...(people.error ? [] : (people.data ?? [])).map((person) => ({
          id: person.id,
          kind: "person" as const,
          label: person.name,
        })),
      ]}
    />
  );
}
