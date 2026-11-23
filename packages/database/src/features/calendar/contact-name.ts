// Shared mailboxes whose local part is not a person's name. Compared without separators, so
// `no-reply` and `no_reply` match `noreply`.
const roleMailboxes = new Set([
  "accounts",
  "admin",
  "billing",
  "calendar",
  "careers",
  "contact",
  "donotreply",
  "finance",
  "hello",
  "help",
  "hr",
  "info",
  "it",
  "jobs",
  "legal",
  "mail",
  "marketing",
  "noreply",
  "notifications",
  "office",
  "press",
  "sales",
  "security",
  "support",
  "team",
]);

const namePart = /^[\p{L}\p{M}]{2,}$/u;

function titleCase(part: string) {
  return part.toLowerCase().replace(/^./u, (first) => first.toUpperCase());
}

/**
 * The name derived from the part of an email before the @: one to three letter-only parts of at
 * least two letters, split by `.`, `_` or `-`, title-cased. A `+tag` is dropped first. Null for
 * role mailboxes and for anything else that does not look like a name.
 */
function nameFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const local = email.slice(0, at).split("+")[0]!.normalize("NFC");
  if (roleMailboxes.has(local.toLowerCase().replace(/[._-]/g, ""))) return null;
  const parts = local.split(/[._-]/);
  if (parts.length > 3 || !parts.every((part) => namePart.test(part))) return null;
  return parts.map(titleCase).join(" ");
}

/** The name for a contact created from a calendar attendee. */
export function contactNameFromAttendee(email: string, displayName?: string | null): string {
  const given = displayName?.trim();
  if (given && given.toLowerCase() !== email.trim().toLowerCase()) return given;
  return nameFromEmail(email) ?? email;
}

/** Whether `name` is one the calendar would have generated from `email`, ignoring case. */
export function isGeneratedContactName(name: string, email: string): boolean {
  const current = name.trim().toLowerCase();
  return current === email.toLowerCase() || current === nameFromEmail(email)?.toLowerCase();
}
