import type { ComboboxOption } from "@/components/ui/combobox";

export function accountOptions(rows: readonly { entityId: string; name: string }[] = []) {
  return rows.map((row): ComboboxOption => ({ value: row.entityId, label: row.name }));
}

export function contactOptions(
  rows: readonly { contact: { entityId: string; displayName: string } }[] = [],
) {
  return rows.map(({ contact }): ComboboxOption => ({
    value: contact.entityId,
    label: contact.displayName,
  }));
}
