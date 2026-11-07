import { conversationInput } from "@startup-os/contracts/messaging/input";

import type { Conversation } from "@/lib/messaging/conversations";
import { parseRecipientEmails } from "@/lib/messaging/recipients";
import { z } from "zod";

export function createConversationDraftSchema(kind: Conversation["kind"]) {
  return z.object({
    name: kind === "channel" ? conversationInput.shape.name.unwrap() : z.string().trim().max(80),
    emails: z.string().superRefine((value, context) => {
      let recipients: string[];
      try {
        recipients = parseRecipientEmails(value);
      } catch {
        context.addIssue({
          code: "custom",
          message: "Enter complete email addresses, separated by commas.",
        });
        return;
      }
      const result = conversationInput.shape.emails.safeParse(recipients);
      if (!result.success) {
        context.addIssue({
          code: "custom",
          message: "Enter no more than 30 recipient email addresses.",
        });
      } else if (kind !== "channel" && !recipients.length) {
        context.addIssue({
          code: "custom",
          message: "Enter at least one recipient email address.",
        });
      } else if (kind === "dm" && recipients.length !== 1) {
        context.addIssue({
          code: "custom",
          message: "Use a group message for more than one recipient.",
        });
      } else if (kind === "group" && recipients.length < 2) {
        context.addIssue({
          code: "custom",
          message: "Enter at least two recipients for a group message.",
        });
      }
    }),
    isPrivate: z.boolean(),
  });
}
