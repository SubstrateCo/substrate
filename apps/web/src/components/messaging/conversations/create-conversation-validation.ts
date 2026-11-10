import { conversationInput, messagingLimits } from "@startup-os/contracts/messaging/input";

import type { Conversation } from "@/lib/messaging/conversations";
import type { PickedRecipient } from "@/lib/people/people-picker";
import { z } from "zod";

export function createConversationDraftSchema(kind: Conversation["kind"]) {
  return z.object({
    name:
      kind === "channel"
        ? z
            .string()
            .trim()
            .min(1, "Enter a channel name.")
            .max(80, "Use 80 characters or fewer.")
            .pipe(conversationInput.shape.name.unwrap())
        : z.string().trim().max(80, "Use 80 characters or fewer."),
    recipients: z.custom<PickedRecipient[]>().superRefine((recipients, context) => {
      let message: string | undefined;
      if (recipients.length > messagingLimits.recipients)
        message = `Add no more than ${messagingLimits.recipients} people.`;
      else if (kind === "dm" && recipients.length !== 1) message = "Choose a person to message.";
      else if (kind === "group" && recipients.length < 2)
        message = "Choose at least two people for a group message.";
      if (message) context.addIssue({ code: "custom", message });
    }),
    isPrivate: z.boolean(),
  });
}
