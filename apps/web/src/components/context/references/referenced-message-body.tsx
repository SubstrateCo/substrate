import type { MessageContextState } from "./message-context";
import { useMessageReferences } from "./use-message-references";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";

export function ReferencedMessageBody({
  organizationId,
  context,
  body,
}: {
  organizationId: string;
  context: MessageContextState;
  body: string;
}) {
  const references = useMessageReferences(organizationId, context);
  return (
    <MessageMarkdown body={body} referencesLoading={context.loading} references={references} />
  );
}
