import { validDate } from "./format";
import type { LucideIcon } from "lucide-react-native";

/** One choice in a filter field. `count` shows beside the label in the sheet. */
export type FilterOption = { value: string; label: string; count?: number };

type FieldBase<Id extends string> = {
  id: Id;
  /** Sentence case, singular: "Type", "Status". */
  label: string;
  icon?: LucideIcon;
  /** The pill has no remove button and always keeps a value. Give it a value at all times. */
  required?: boolean;
};

/** A field whose values come from a list of options. */
export type FilterField<Id extends string = string> = FieldBase<Id> & {
  kind?: "option";
  options: readonly FilterOption[];
  /** Several values can be chosen. The sheet stays open and toggles values. */
  multiple?: boolean;
  /** Lowercase plural noun for a count summary: "3 types". Defaults to "3 selected". */
  pluralLabel?: string;
  /** The options are still loading. */
  loading?: boolean;
};

/** Two YYYY-MM-DD calendar dates. Both days are included. */
export type DateRange = { from: string; through: string };

/** A field whose value is a date range, typed in the sheet. */
export type DateRangeFilterField<Id extends string = string> = FieldBase<Id> & {
  kind: "date-range";
  /** Shown under the date inputs, such as the time zone the dates use. */
  description?: string;
};

/** A field whose value is a whole number from `min` to `max`, typed in the sheet. */
export type NumberFilterField<Id extends string = string> = FieldBase<Id> & {
  kind: "number";
  min: number;
  max: number;
  /** The unit after the number: "1 day", "30 days". */
  unit: { one: string; other: string };
};

export type FilterFieldValue = readonly string[] | DateRange | number;
export type AnyFilterField<Id extends string = string> =
  | FilterField<Id>
  | DateRangeFilterField<Id>
  | NumberFilterField<Id>;

/**
 * Active filters keyed by field ID. Fields are AND-combined; several values in one field match any
 * of them. A field with no values is absent.
 */
export type FilterValue<Id extends string = string> = Partial<Record<Id, readonly string[]>>;

/** Any filter value shape: option fields hold string lists, range fields a `DateRange`, number fields a number. */
export type FilterValues = { [id: string]: FilterFieldValue | undefined };

type FieldFor<Id extends string, T> = T extends number
  ? NumberFilterField<Id>
  : T extends DateRange
    ? DateRangeFilterField<Id>
    : FilterField<Id>;

/** The field definitions that match a value shape, so each field's kind matches its value's type. */
export type FilterFieldOf<V extends FilterValues> = {
  [K in keyof V & string]-?: FieldFor<K, NonNullable<V[K]>>;
}[keyof V & string];

/** A field with its current value, tagged by kind so both narrow together. */
export type FilterEntry =
  | { kind: "option"; field: FilterField; value: readonly string[] }
  | { kind: "date-range"; field: DateRangeFilterField; value: DateRange }
  | { kind: "number"; field: NumberFilterField; value: number };

/** Whether a field's value counts as a filter. An empty option list does not. */
export function isSet(value: FilterFieldValue | undefined): value is FilterFieldValue {
  if (value === undefined) return false;
  return !Array.isArray(value) || value.length > 0;
}

/** The field paired with its value, or undefined when the field has no filter. */
export function filterEntry<V extends FilterValues>(
  field: FilterFieldOf<V>,
  value: V,
): FilterEntry | undefined {
  const current = value[field.id];
  if (!isSet(current)) return undefined;
  // SAFETY: FilterFieldOf<V> gives each field the kind that matches the type of V[field.id].
  return { kind: field.kind ?? "option", field, value: current } as FilterEntry;
}

/** The value with one field set, or the field removed when `next` is empty. */
export function withValues<V extends FilterValues, K extends keyof V>(
  value: V,
  id: K,
  next: V[K] | undefined,
): V {
  const result: V = { ...value };
  if (isSet(next)) result[id] = next;
  else delete result[id];
  return result;
}

/** Whether any field that clearing would reset has a filter. */
export function hasClearableFilters<V extends FilterValues>(
  fields: readonly FilterFieldOf<V>[],
  value: V,
) {
  return fields.some((field) => !field.required && isSet(value[field.id]));
}

/** Whether a field without a pill remains. Pills edit their own field in place. */
export function canAddFilter<V extends FilterValues>(
  fields: readonly FilterFieldOf<V>[],
  value: V,
) {
  return fields.some((field) => !isSet(value[field.id]));
}

/** The value with every optional field's filter removed. Required fields keep theirs. */
export function clearFilters<V extends FilterValues>(
  fields: readonly FilterFieldOf<V>[],
  value: V,
): V {
  let next = value;
  for (const field of fields) if (!field.required) next = withValues(next, field.id, undefined);
  return next;
}

/**
 * A field's values after a tap on one option. A single choice replaces the value; a multiple
 * choice toggles it, and a required field keeps its last value.
 */
export function chooseOption(field: FilterField, values: readonly string[], option: string) {
  if (!field.multiple) return [option];
  const next = values.includes(option)
    ? values.filter((value) => value !== option)
    : [...values, option];
  return next.length || !field.required ? next : values;
}

/** How the operator reads for a number of values: "is" for one, "is any of" for several. */
export function operatorLabel(count: number) {
  return count > 1 ? "is any of" : "is";
}

/** A pill's value text: one label, or "3 types". A value missing from the options reads "Unknown". */
export function summarizeValues(field: FilterField, values: readonly string[]) {
  const labels = values.map(
    (value) => field.options.find((option) => option.value === value)?.label ?? "Unknown",
  );
  if (labels.length === 1) return labels[0] ?? "Unknown";
  return `${labels.length} ${field.pluralLabel ?? "selected"}`;
}

/** Why a date range can't be used, or null when both dates are real and in order. */
export function dateRangeError(range: DateRange) {
  if (!validDate(range.from) || !validDate(range.through))
    return "Use real dates, like 2026-12-31.";
  if (range.from > range.through) return "The end date must be on or after the start date.";
  return null;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A range as calendar dates without any time zone shift: "Nov 1 – 26, 2026",
 * "Nov 28 – Dec 3, 2026", or "Dec 30, 2026 – Jan 2, 2027".
 */
export function summarizeDateRange(range: DateRange) {
  if (dateRangeError(range)) return "Invalid dates";
  const [fromYear, fromMonth = 1, fromDay] = range.from.split("-").map(Number);
  const [toYear, toMonth = 1, toDay] = range.through.split("-").map(Number);
  const from = `${months[fromMonth - 1]} ${fromDay}`;
  if (fromYear !== toYear)
    return `${from}, ${fromYear} – ${months[toMonth - 1]} ${toDay}, ${toYear}`;
  if (fromMonth !== toMonth) return `${from} – ${months[toMonth - 1]} ${toDay}, ${toYear}`;
  if (fromDay !== toDay) return `${from} – ${toDay}, ${toYear}`;
  return `${from}, ${toYear}`;
}

/** The typed number when it is a whole number within the field's bounds, otherwise null. */
export function parseNumber(field: NumberFilterField, text: string) {
  const trimmed = text.trim();
  if (!/^\d{1,9}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= field.min && value <= field.max ? value : null;
}

export function numberError(field: NumberFilterField, text: string) {
  return parseNumber(field, text) === null
    ? `Use a whole number from ${field.min} to ${field.max}.`
    : null;
}

export function summarizeNumber(field: NumberFilterField, value: number) {
  return `${value} ${value === 1 ? field.unit.one : field.unit.other}`;
}

/** The pill's operator for a field and its value. */
export function entryOperator(entry: FilterEntry) {
  if (entry.kind === "date-range") return "is between";
  if (entry.kind === "number") return "is";
  return operatorLabel(entry.value.length);
}

/** The pill's value text for any field kind. */
export function summarizeEntry(entry: FilterEntry) {
  if (entry.kind === "date-range") return summarizeDateRange(entry.value);
  if (entry.kind === "number") return summarizeNumber(entry.field, entry.value);
  return summarizeValues(entry.field, entry.value);
}

/** A pill's accessible name: "Type is Meeting", "Close date is between Nov 1 – 26, 2026". */
export function filterLabel(entry: FilterEntry) {
  return `${entry.field.label} ${entryOperator(entry)} ${summarizeEntry(entry)}`;
}

/** The field's single value when it is one of `allowed`. Unknown values read as no filter. */
export function oneOf<T extends string>(
  values: readonly string[] | undefined,
  allowed: readonly T[],
): T | undefined {
  const [first] = values ?? [];
  return allowed.find((candidate) => candidate === first);
}
