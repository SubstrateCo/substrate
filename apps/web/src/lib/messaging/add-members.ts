import type { PickedRecipient } from "@substrate/contracts/people/picker";

import { recipientEmails } from "@/lib/people/people-picker";

export class AddMembersError extends Error {
  constructor(
    public readonly completed: PickedRecipient[],
    public readonly cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : "Try again.";
    super(
      completed.length
        ? `${completed.length} added. Some people could not be added. ${detail}`
        : detail,
    );
  }
}

/** The APIs have different authority rules; keep successful changes if a later action fails. */
export async function addConversationRecipients(
  recipients: PickedRecipient[],
  actions: {
    people: (emails: string[]) => Promise<void>;
    agent: (agentId: string) => Promise<void>;
  },
) {
  const completed: PickedRecipient[] = [];
  try {
    const emails = recipientEmails(recipients);
    if (emails.length) {
      await actions.people(emails);
      completed.push(...recipients.filter((recipient) => !recipient.agent));
    }
    for (const recipient of recipients) {
      if (!recipient.agent) continue;
      await actions.agent(recipient.agent.id);
      completed.push(recipient);
    }
  } catch (error) {
    throw new AddMembersError(completed, error);
  }
}
