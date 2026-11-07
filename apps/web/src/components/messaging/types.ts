export type Conversation = {
  id: string;
  kind: "dm" | "group" | "channel";
  name: string | null;
  private: boolean;
  partner?: boolean;
};

export type Message = {
  id: string;
  body: string;
  authorName: string;
  authorId: string;
  createdAt: string | Date;
  threadId: string | null;
  replyCount: number;
  reactions: { emoji: string; count: number; reacted: boolean }[];
};

export function conversationName(conversation: Conversation): string {
  return (
    conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Direct message")
  );
}
