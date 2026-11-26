import type { PickedRecipient, PickerPerson } from "@substrate/contracts/people/picker";

import { z } from "zod";

const emailSchema = z.email().max(320);

export function isEmailAddress(value: string) {
  return emailSchema.safeParse(value.trim()).success;
}

const normalize = (value: string) => value.trim().toLowerCase();

/** The recipient for one typed address. An address of an offered person picks that person. */
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

/**
 * Adds typed or pasted addresses, separated by commas, semicolons, or spaces. Returns the new
 * value and the text that is not a usable address, so the person can correct it.
 *
 * When more usable addresses arrive than `max` leaves room for, nothing is added and `overflow`
 * is set. The whole text comes back in `rest`, so no address is dropped and none is picked for
 * the person.
 */
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

/** The most people the picker can hold, in words: "Choose one person." */
export function limitMessage(max: number) {
  return max === 1 ? "Choose one person." : `Choose up to ${max} people.`;
}

/**
 * The field error for text still in the picker when the form is submitted. The picker adds
 * complete addresses by itself, so text left is either not an address yet or more addresses than
 * fit. Pass `limit` to name the second case.
 */
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

/** Recipients who are not one of the offered people and will receive an invitation. */
export function invitedRecipients(value: readonly PickedRecipient[]) {
  return value.filter((recipient) => !recipient.person && !recipient.agent);
}
