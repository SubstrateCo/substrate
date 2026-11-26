import type { FilterValue } from "@/components/filters";

export type RecordFilterFieldId = "records";

/** The archive filter as filter-bar clauses. Active records are the default and have none. */
export function recordFilterValue(archived: boolean): FilterValue<RecordFilterFieldId> {
  return archived ? { records: { operator: "is", values: ["archived"] } } : {};
}

/** Whether filter-bar clauses ask for archived records only. Any other value means active. */
export function archivedFromFilterValue(value: FilterValue<RecordFilterFieldId>) {
  return value.records?.values[0] === "archived";
}
