import { useQueries } from "@tanstack/react-query";

import type { MessageContextState } from "./message-context";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { referenceTokenPattern } from "@/components/messaging/references/reference-token";
import { linkedWorkHref, messageHref } from "@/lib/navigation/record-links";
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
          href: messageHref(
            organizationId,
            reference.conversationId,
            reference.threadId ?? undefined,
          ),
        })),
        ...(context.error ? [] : (context.data?.links ?? [])).map((link) => ({
          id: link.entityId,
          kind: link.entityType,
          label: link.title,
          status:
            link.status && link.statusName
              ? { value: link.status, label: link.statusName }
              : undefined,
          href: linkedWorkHref(organizationId, link),
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
