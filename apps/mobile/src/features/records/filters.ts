import { validDate } from "./format";
import type { LucideIcon } from "lucide-react-native";

export type FilterOption = { value: string; label: string; count?: number };

type FieldBase<Id extends string> = {
  id: Id;
  label: string;
  icon?: LucideIcon;
  required?: boolean;
};

export type FilterField<Id extends string = string> = FieldBase<Id> & {
  kind?: "option";
  options: readonly FilterOption[];
  multiple?: boolean;
  pluralLabel?: string;
  loading?: boolean;
};

export type DateRange = { from: string; through: string };

export type DateRangeFilterField<Id extends string = string> = FieldBase<Id> & {
  kind: "date-range";
  description?: string;
};

export type NumberFilterField<Id extends string = string> = FieldBase<Id> & {
  kind: "number";
  min: number;
  max: number;
  unit: { one: string; other: string };
};

export type FilterFieldValue = readonly string[] | DateRange | number;
export type AnyFilterField<Id extends string = string> =
  | FilterField<Id>
  | DateRangeFilterField<Id>
  | NumberFilterField<Id>;

export type FilterValue<Id extends string = string> = Partial<Record<Id, readonly string[]>>;

export type FilterValues = { [id: string]: FilterFieldValue | undefined };

type FieldFor<Id extends string, T> = T extends number
  ? NumberFilterField<Id>
  : T extends DateRange
    ? DateRangeFilterField<Id>
    : FilterField<Id>;

export type FilterFieldOf<V extends FilterValues> = {
  [K in keyof V & string]-?: FieldFor<K, NonNullable<V[K]>>;
}[keyof V & string];

export type FilterEntry =
  | { kind: "option"; field: FilterField; value: readonly string[] }
  | { kind: "date-range"; field: DateRangeFilterField; value: DateRange }
  | { kind: "number"; field: NumberFilterField; value: number };

function isSet(value: FilterFieldValue | undefined): value is FilterFieldValue {
  if (value === undefined) return false;
  return !Array.isArray(value) || value.length > 0;
}

export function filterEntry<V extends FilterValues>(
  field: FilterFieldOf<V>,
  value: V,
): FilterEntry | undefined {
  const current = value[field.id];
  if (!isSet(current)) return undefined;
  // SAFETY: FilterFieldOf<V> gives each field the kind that matches the type of V[field.id].
  return { kind: field.kind ?? "option", field, value: current } as FilterEntry;
}

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

export function hasClearableFilters<V extends FilterValues>(
  fields: readonly FilterFieldOf<V>[],
  value: V,
) {
  return fields.some((field) => !field.required && isSet(value[field.id]));
}

export function canAddFilter<V extends FilterValues>(
  fields: readonly FilterFieldOf<V>[],
  value: V,
) {
  return fields.some((field) => !isSet(value[field.id]));
}

export function clearFilters<V extends FilterValues>(
  fields: readonly FilterFieldOf<V>[],
  value: V,
): V {
  let next = value;
  for (const field of fields) if (!field.required) next = withValues(next, field.id, undefined);
  return next;
}

export function chooseOption(field: FilterField, values: readonly string[], option: string) {
  if (!field.multiple) return [option];
  const next = values.includes(option)
    ? values.filter((value) => value !== option)
    : [...values, option];
  return next.length || !field.required ? next : values;
}

function operatorLabel(count: number) {
  return count > 1 ? "is any of" : "is";
}

function summarizeValues(field: FilterField, values: readonly string[]) {
  const labels = values.map(
    (value) => field.options.find((option) => option.value === value)?.label ?? "Unknown",
  );
  if (labels.length === 1) return labels[0] ?? "Unknown";
  return `${labels.length} ${field.pluralLabel ?? "selected"}`;
}

export function dateRangeError(range: DateRange) {
  if (!validDate(range.from) || !validDate(range.through))
    return "Use real dates, like 2026-12-31.";
  if (range.from > range.through) return "The end date must be on or after the start date.";
  return null;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function summarizeNumber(field: NumberFilterField, value: number) {
  return `${value} ${value === 1 ? field.unit.one : field.unit.other}`;
}

export function entryOperator(entry: FilterEntry) {
  if (entry.kind === "date-range") return "is between";
  if (entry.kind === "number") return "is";
  return operatorLabel(entry.value.length);
}

export function summarizeEntry(entry: FilterEntry) {
  if (entry.kind === "date-range") return summarizeDateRange(entry.value);
  if (entry.kind === "number") return summarizeNumber(entry.field, entry.value);
  return summarizeValues(entry.field, entry.value);
}

export function filterLabel(entry: FilterEntry) {
  return `${entry.field.label} ${entryOperator(entry)} ${summarizeEntry(entry)}`;
}

export function oneOf<T extends string>(
  values: readonly string[] | undefined,
  allowed: readonly T[],
): T | undefined {
  const [first] = values ?? [];
  return allowed.find((candidate) => candidate === first);
}
