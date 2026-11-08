export type Conversation = {
  id: string;
  kind: "dm" | "group" | "channel";
  name: string | null;
  private: boolean;
  partner?: boolean;
  createdBy?: string;
  members?: { userId: string; name: string }[];
  // Active member. Public channels the person never joined or left stay readable but leave the sidebar.
  joined?: boolean;
  canManage?: boolean;
};

export function conversationName(conversation: Conversation): string {
  return (
    conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Direct message")
  );
}
