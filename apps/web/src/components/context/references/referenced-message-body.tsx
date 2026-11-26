import type { MessageContextState } from "./message-context";
import { useMessageReferences } from "./use-message-references";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";

export function ReferencedMessageBody({
  context,
  body,
}: {
  context: MessageContextState;
  body: string;
}) {
  const references = useMessageReferences(context);
  return (
    <MessageMarkdown body={body} referencesLoading={context.loading} references={references} />
  );
}
