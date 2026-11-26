import { messagingLimits } from "@substrate/contracts/messaging/input";
import type { PickedRecipient, PickerPerson } from "@substrate/contracts/people/picker";

import type { ConversationKind } from "../types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalize = (value: string) => value.trim().toLowerCase();

export function isEmailAddress(value: string) {
  const email = value.trim();
  return email.length <= 320 && emailPattern.test(email);
}

/** The recipient for a typed address. An address of a workspace member picks that person. */
export function recipientFor(text: string, people: readonly PickerPerson[]) {
  const email = normalize(text);
  if (!isEmailAddress(email)) return undefined;
  const person = people.find((candidate) => normalize(candidate.email) === email);
  return person ? { email, person } : { email };
}

export function invitedRecipients(value: readonly PickedRecipient[]) {
  return value.filter((recipient) => !recipient.person && !recipient.agent);
}

export function recipientEmails(value: readonly PickedRecipient[]) {
  return value.flatMap((recipient) => (recipient.email ? [recipient.email] : []));
}

export type CreateDraft = { name: string; recipients: PickedRecipient[] };

/** The first problem with a new conversation, in the order the form shows its fields. */
export function createConversationProblem(kind: ConversationKind, draft: CreateDraft) {
  const name = draft.name.trim();
  if (kind === "channel" && !name) return { field: "name", message: "Enter a channel name." };
  if (name.length > 80) return { field: "name", message: "Use 80 characters or fewer." };
  const count = draft.recipients.length;
  if (count > messagingLimits.recipients)
    return {
      field: "recipients",
      message: `Add no more than ${messagingLimits.recipients} people.`,
    };
  if (kind === "dm" && count !== 1)
    return { field: "recipients", message: "Choose a person to message." };
  if (kind === "group" && count < 2)
    return { field: "recipients", message: "Choose at least two people for a group message." };
  return undefined;
}
