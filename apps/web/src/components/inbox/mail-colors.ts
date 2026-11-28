import {
  mailColors,
  type MailColor,
  type MailLabel,
  type Mailbox,
} from "@substrate/contracts/mail";

export const ink: Record<MailColor, string> = {
  Indigo: "text-primary",
  Teal: "text-chart-2",
  Amber: "text-warning-text",
  Blue: "text-chart-3",
  Rose: "text-destructive",
  Violet: "text-chart-4",
  Green: "text-success",
  Slate: "text-muted-foreground",
};
const gmailLabels = new Map<string, [string, MailColor]>([
  ["CATEGORY_PROMOTIONS", ["Promotions", "Rose"]],
  ["CATEGORY_PERSONAL", ["Personal", "Blue"]],
  ["CATEGORY_SOCIAL", ["Social", "Violet"]],
  ["CATEGORY_UPDATES", ["Updates", "Teal"]],
  ["CATEGORY_FORUMS", ["Forums", "Indigo"]],
  ["IMPORTANT", ["Important", "Amber"]],
  ["CHAT", ["Chat", "Green"]],
]);
export const labelName = (label: MailLabel) => gmailLabels.get(label.id)?.[0] ?? label.name;
export function visibleLabels(box: Mailbox, ids: readonly string[], inRows = false) {
  return box.labels
    .filter((label) => ids.includes(label.id) && !(inRows && label.hideInRows))
    .sort(
      (a, b) =>
        Number(gmailLabels.has(a.id)) - Number(gmailLabels.has(b.id)) ||
        labelName(a).localeCompare(labelName(b)),
    );
}

function paletteIndex(key: string) {
  let hash = 0;
  for (const char of key) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return hash % mailColors.length;
}
export const defaultLabelColor = (label: MailLabel) =>
  gmailLabels.get(label.id)?.[1] ?? mailColors[paletteIndex(label.id)]!;
export function mailboxColors(boxes: readonly Mailbox[]) {
  const colors = new Map<string, MailColor>();
  const used = new Set<MailColor>();
  for (const box of [...boxes].sort(
    (a, b) => a.address.localeCompare(b.address) || a.id.localeCompare(b.id),
  )) {
    let index = paletteIndex(box.address.toLowerCase());
    while (used.size < mailColors.length && used.has(mailColors[index]!))
      index = (index + 1) % mailColors.length;
    const color = mailColors[index]!;
    colors.set(box.id, color);
    used.add(color);
  }
  return colors;
}
