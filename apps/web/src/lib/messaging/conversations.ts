export type Conversation = {
  id: string;
  kind: "dm" | "group" | "channel";
  name: string | null;
  private: boolean;
  partner?: boolean;
  createdBy?: string;
  members?: { userId: string; name: string }[];
  // The person left this public channel. It stays readable but leaves the sidebar.
  left?: boolean;
  canManage?: boolean;
};

export function conversationName(conversation: Conversation): string {
  return (
    conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Direct message")
  );
}
