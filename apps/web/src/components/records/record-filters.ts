import type { FilterValue } from "@/components/filters";

export type RecordFilterFieldId = "records";

export function recordFilterValue(archived: boolean): FilterValue<RecordFilterFieldId> {
  return archived ? { records: { operator: "is", values: ["archived"] } } : {};
}

export function archivedFromFilterValue(value: FilterValue<RecordFilterFieldId>) {
  return value.records?.values[0] === "archived";
}
