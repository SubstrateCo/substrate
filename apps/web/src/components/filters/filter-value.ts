import type { ReactNode } from "react";

import type {
  FilterClause,
  FilterField,
  FilterOperator,
  FilterOption,
  FilterValue,
  OptionFilterField,
} from "./types";
import { formatShortDate, parseDateOnly } from "@/lib/format/date";

export function fieldOperators(field: FilterField): readonly FilterOperator[] {
  if (field.kind === "number")
    return field.operators ?? ["equal to", "less than", "greater than", "between"];
  return field.operators?.length ? field.operators : ["is"];
}

export function operatorLabel(operator: FilterOperator, count: number) {
  if (count > 1 && operator === "is") return "is any of";
  if (count > 1 && operator === "is not") return "is none of";
  return operator;
}

export function withClause<Id extends string>(
  value: FilterValue<Id>,
  id: Id,
  clause: FilterClause | undefined,
): FilterValue<Id> {
  const next: FilterValue<Id> = { ...value };
  if (clause?.values.length) next[id] = clause;
  else delete next[id];
  return next;
}

export function hasClearableFilters<Id extends string>(
  fields: readonly FilterField<Id>[],
  value: FilterValue<Id>,
) {
  return fields.some((field) => !field.required && !!value[field.id]?.values.length);
}

export function canAddFilter<Id extends string>(
  fields: readonly FilterField<Id>[],
  value: FilterValue<Id>,
) {
  return fields.some((field) => !value[field.id]?.values.length);
}

export function clearFilterValue<Id extends string>(
  fields: readonly FilterField<Id>[],
  value: FilterValue<Id>,
): FilterValue<Id> {
  let next = value;
  for (const field of fields) if (!field.required) next = withClause(next, field.id, undefined);
  return next;
}

export function toggleValue(values: readonly string[], option: string) {
  return values.includes(option) ? values.filter((value) => value !== option) : [...values, option];
}

export function isOptionChecked(
  field: OptionFilterField,
  values: readonly string[],
  option: string,
) {
  return values.includes(option) !== (field.multiple === true && field.checks === "unchosen");
}

export function orderOptions(options: readonly FilterOption[], chosenOnOpen: readonly string[]) {
  const rank = (option: FilterOption) => {
    const index = chosenOnOpen.indexOf(option.value);
    return index === -1 ? chosenOnOpen.length : index;
  };
  const groups = [...new Set(options.map((option) => option.group))];
  // The sort is stable, so unranked options keep field order.
  return groups.flatMap((group) =>
    options.filter((option) => option.group === group).sort((a, b) => rank(a) - rank(b)),
  );
}

export type ClauseSummary = {
  text: string;
  labels: string[];
  icons: { value: string; icon: ReactNode }[];
};

const maxSummaryIcons = 3;

export function summarizeClause(
  field: FilterField,
  clause: FilterClause,
  now: Date | number = Date.now(),
): ClauseSummary {
  if (field.kind === "number") {
    const text = clause.values.join(" and ");
    return { text, labels: [...clause.values], icons: [] };
  }
  if (field.kind === "date") {
    const day = clause.values[0];
    const date = day ? parseDateOnly(day) : undefined;
    const text = date ? formatShortDate(date, now) : "Unknown date";
    return { text, labels: [text], icons: [] };
  }
  const chosen = clause.values.map((value) =>
    field.options.find((option) => option.value === value),
  );
  const labels = chosen.map((option) => option?.label ?? "Unknown");
  const icons = chosen
    .flatMap((option) =>
      option?.icon === undefined ? [] : [{ value: option.value, icon: option.icon }],
    )
    .slice(0, maxSummaryIcons);
  if (labels.length === 1) return { text: labels[0] ?? "Unknown", labels, icons };
  const noun = field.pluralLabel ?? "selected";
  return { text: `${labels.length} ${noun}`, labels, icons };
}

export function clauseLabel(field: FilterField, clause: FilterClause, now?: Date | number) {
  const operator = operatorLabel(clause.operator, clause.values.length);
  return `${field.label} ${operator} ${summarizeClause(field, clause, now).text}`;
}
