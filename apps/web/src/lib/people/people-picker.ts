import { z } from "zod";

/** A person the viewer may choose, such as a member of the current workspace. */
export type PickerPerson = { id: string; name: string; email: string; image?: string | null };

/**
 * A chosen recipient. `person` is set when the email address belongs to one of the offered
 * people; without it, the address is someone to invite.
 */
export type PickedRecipient = { email: string; person?: PickerPerson };

const emailSchema = z.email().max(320);

export function isEmailAddress(value: string) {
  return emailSchema.safeParse(value.trim()).success;
}

const normalize = (value: string) => value.trim().toLowerCase();

/** People who match the query by name or email and are not chosen yet, in their given order. */
export function matchPeople(
  people: readonly PickerPerson[],
  query: string,
  chosen: readonly PickedRecipient[],
) {
  const search = normalize(query);
  const taken = new Set(chosen.map((recipient) => recipient.email));
  return people.filter(
    (person) =>
      !taken.has(normalize(person.email)) &&
      (!search ||
        person.name.toLowerCase().includes(search) ||
        person.email.toLowerCase().includes(search)),
  );
}

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

/**
 * Adds typed or pasted addresses, separated by commas, semicolons, or spaces. Returns the new
 * value and the text that is not a usable address, so the person can correct it.
 */
export function addTypedRecipients(
  value: readonly PickedRecipient[],
  text: string,
  people: readonly PickerPerson[],
  { allowEmail = true, max }: { allowEmail?: boolean; max?: number } = {},
) {
  const next = [...value];
  const rest: string[] = [];
  for (const token of text.split(/[,;\s]+/).filter(Boolean)) {
    const recipient = recipientFor(token, people, allowEmail);
    if (!recipient) rest.push(token);
    else if (next.some((entry) => entry.email === recipient.email)) continue;
    else if (max === undefined || next.length < max) next.push(recipient);
    else rest.push(token);
  }
  return { value: next, rest: rest.join(", ") };
}

/**
 * The field error for text still in the picker when the form is submitted. The picker adds
 * complete addresses by itself, so any text left is not a usable recipient.
 */
export function unfinishedRecipientMessage(text: string) {
  const unfinished = text.trim();
  if (!unfinished) return undefined;
  return `“${unfinished}” isn’t a complete email address. Finish it or clear it.`;
}

export function recipientEmails(value: readonly PickedRecipient[]) {
  return value.map((recipient) => recipient.email);
}

/** Recipients who are not one of the offered people and will receive an invitation. */
export function invitedRecipients(value: readonly PickedRecipient[]) {
  return value.filter((recipient) => !recipient.person);
}
