import { filterLabels, type Mailbox, type MailLabel } from "@substrate/contracts/mail";
import type { MailLabelFilter } from "@substrate/contracts/mail/ipc";

import { z } from "zod";

/** One label filter as a filter-bar option value. Any characters in either ID survive. */
export function labelOptionValue(label: MailLabelFilter) {
  return JSON.stringify([label.mailboxId, label.id]);
}

const labelOption = z.tuple([z.string().min(1), z.string().min(1)]);

/** The label filter an option value names, or undefined for a value this app did not write. */
export function parseLabelOptionValue(value: string | undefined): MailLabelFilter | undefined {
  if (!value) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return undefined;
  }
  const parsed = labelOption.safeParse(json);
  if (!parsed.success) return undefined;
  const [mailboxId, id] = parsed.data;
  return { mailboxId, id };
}

/**
 * The labels to choose from, by mailbox: the visible labels of the mailbox in scope, or of every
 * mailbox when none is chosen. Local mail filters a label only inside its own mailbox, so a label
 * from another mailbox is never offered. The active label stays listed after it is hidden, such
 * as a "show if unread" label that was just read, so its pill keeps its name.
 */
export function labelChoices(
  boxes: readonly Mailbox[],
  scope: Mailbox | null,
  active: MailLabelFilter | undefined,
): { box: Mailbox; label: MailLabel }[] {
  return (scope ? [scope] : boxes).flatMap((box) => {
    const visible = filterLabels(box);
    const current =
      active?.mailboxId === box.id && !visible.some((label) => label.id === active.id)
        ? box.labels.find((label) => label.id === active.id)
        : undefined;
    return (current ? [current, ...visible] : visible).map((label) => ({ box, label }));
  });
}
