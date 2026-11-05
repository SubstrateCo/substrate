import { z } from "zod";

export type Conversation = {
  id: string;
  kind: "dm" | "group" | "channel";
  name: string | null;
  private: boolean;
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

const recipientEmailSchema = z.array(z.email().max(320));

export function parseRecipientEmails(value: string): string[] {
  const emails = [
    ...new Set(
      value
        .split(/[,;\s]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const result = recipientEmailSchema.safeParse(emails);
  if (!result.success) {
    throw new Error("Enter complete email addresses, separated by commas.");
  }
  return result.data;
}

export function conversationName(conversation: Conversation): string {
  return (
    conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Direct message")
  );
}
