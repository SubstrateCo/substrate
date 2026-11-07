export type Conversation = {
  id: string;
  kind: "dm" | "group" | "channel";
  name: string | null;
  private: boolean;
  partner?: boolean;
};

export function conversationName(conversation: Conversation): string {
  return (
    conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Direct message")
  );
}
