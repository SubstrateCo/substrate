import { filterLabels, type Mailbox, type MailLabel } from "@substrate/contracts/mail";
import type { MailLabelFilter } from "@substrate/contracts/mail/ipc";

import { z } from "zod";

export function labelOptionValue(label: MailLabelFilter) {
  return JSON.stringify([label.mailboxId, label.id]);
}

const labelOption = z.tuple([z.string().min(1), z.string().min(1)]);

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
