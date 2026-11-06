import { z } from "zod";

export { conversationName, type Conversation } from "@/ui/messaging/types";
import type { listMessages } from "@/api/messaging";
export type Message = Awaited<ReturnType<typeof listMessages>>[number];

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
