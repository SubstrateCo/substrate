import type { ConversationKind } from "@substrate/contracts/messaging/input";

export function discussionConversationName(source: {
  conversationName: string | null;
  conversationKind?: ConversationKind;
}) {
  return (
    source.conversationName ??
    (source.conversationKind === "group" ? "Group message" : "Direct message")
  );
}
