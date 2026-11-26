import type { ConversationKind } from "@substrate/contracts/messaging/input";

/** The name of a discussion's conversation. An unnamed one reads as its kind. */
export function discussionConversationName(source: {
  conversationName: string | null;
  conversationKind?: ConversationKind;
}) {
  return (
    source.conversationName ??
    (source.conversationKind === "group" ? "Group message" : "Direct message")
  );
}
