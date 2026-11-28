import type { PickedRecipient, PickerPerson } from "@substrate/contracts/people/picker";

import type { ActorIdentity } from "@/lib/actors/identity";
import { z } from "zod";

const emailSchema = z.email().max(320);

export function isEmailAddress(value: string) {
  return emailSchema.safeParse(value.trim()).success;
}

const normalize = (value: string) => value.trim().toLowerCase();

export function recipientFor(
  text: string,
  people: readonly PickerPerson[],
  allowEmail: boolean,
): PickedRecipient | undefined {
  const email = normalize(text);
  if (!isEmailAddress(email)) return undefined;
  const person = people.find((candidate) => normalize(candidate.email) === email);
  if (person) return { email, person };
  return allowEmail ? { email } : undefined;
}

const tokensOf = (text: string) => text.split(/[,;\s]+/).filter(Boolean);

export function addTypedRecipients(
  value: readonly PickedRecipient[],
  text: string,
  people: readonly PickerPerson[],
  { allowEmail = true, max }: { allowEmail?: boolean; max?: number } = {},
) {
  const additions: PickedRecipient[] = [];
  const rest: string[] = [];
  for (const token of tokensOf(text)) {
    const recipient = recipientFor(token, people, allowEmail);
    if (!recipient) rest.push(token);
    else if (![...value, ...additions].some((entry) => entry.email === recipient.email)) {
      additions.push(recipient);
    }
  }
  if (max !== undefined && value.length + additions.length > max) {
    return { value: [...value], rest: tokensOf(text).join(", "), overflow: true };
  }
  return { value: [...value, ...additions], rest: rest.join(", "), overflow: false };
}

export function limitMessage(max: number) {
  return max === 1 ? "Choose one person." : `Choose up to ${max} people.`;
}

export function unfinishedRecipientMessage(text: string, limit?: string) {
  const unfinished = text.trim();
  if (!unfinished) return undefined;
  if (limit && tokensOf(unfinished).every(isEmailAddress)) return limit;
  return `“${unfinished}” isn’t a complete email address. Finish it or clear it.`;
}

export function recipientEmails(value: readonly PickedRecipient[]) {
  return value.flatMap((recipient) => (recipient.email ? [recipient.email] : []));
}

export function recipientAgentIds(value: readonly PickedRecipient[]) {
  return value.flatMap((recipient) => (recipient.agent ? [recipient.agent.id] : []));
}

export function recipientKey(recipient: PickedRecipient) {
  return recipient.agent ? `agent:${recipient.agent.id}` : recipient.email;
}

export function recipientActor(recipient: PickedRecipient): ActorIdentity | null {
  if (recipient.agent)
    return { kind: "agent", name: recipient.agent.name, avatar: recipient.agent.avatar };
  if (recipient.person)
    return { kind: "person", name: recipient.person.name, image: recipient.person.image ?? null };
  return null;
}

export function invitedRecipients(value: readonly PickedRecipient[]) {
  return value.filter((recipient) => !recipient.person && !recipient.agent);
}
