import { useQueries } from "@tanstack/react-query";

import type { MessageContextState } from "./message-context";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { referenceTokenPattern } from "@/components/messaging/references/reference-token";
import { linkedWorkLink, messageLink } from "@/lib/navigation/record-links";
import { messagingProfileOptions } from "@/queries/messaging/profiles";

export function ReferencedMessageBody({
  organizationId,
  conversationId,
  context,
  body,
}: {
  organizationId: string;
  conversationId: string;
  context: MessageContextState;
  body: string;
}) {
  // Agent mentions resolve through conversation profiles. The server checks access for each one.
  const agentIds = [
    ...new Set(
      [...body.matchAll(referenceTokenPattern)].flatMap((match) =>
        match[1]!.toLowerCase() === "agent" ? [match[2]!.toLowerCase()] : [],
      ),
    ),
  ];
  const agents = useQueries({
    queries: agentIds.map((actorId) =>
      messagingProfileOptions(organizationId, conversationId, actorId),
    ),
  });
  return (
    <MessageMarkdown
      body={body}
      referencesLoading={context.loading || agents.some((agent) => agent.isPending)}
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
          .filter((link) => link.entityType === "task" || link.entityType === "project")
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
        ...agents.flatMap((agent, index) =>
          agent.data?.type === "agent"
            ? [{ id: agentIds[index]!, kind: "agent" as const, label: agent.data.name }]
            : [],
        ),
      ]}
    />
  );
}
