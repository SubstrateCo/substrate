import type { ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

type OptionFilterOperator = "is" | "is not";
type DateFilterOperator = "is" | "is before" | "is after";
export type FilterOperator = OptionFilterOperator | DateFilterOperator;

export type FilterOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  group?: string;
};

type FilterFieldBase<Id extends string> = {
  id: Id;
  label: string;
  icon: LucideIcon;
  required?: boolean;
};

export type OptionFilterField<Id extends string = string> = FilterFieldBase<Id> & {
  kind: "option";
  multiple?: boolean;
  checks?: "chosen" | "unchosen";
  options: readonly FilterOption[];
  operators?: readonly OptionFilterOperator[];
  pluralLabel?: string;
  loading?: boolean;
  error?: string;
  emptyLabel?: string;
};

export type DateFilterField<Id extends string = string> = FilterFieldBase<Id> & {
  kind: "date";
  operators?: readonly DateFilterOperator[];
};

export type FilterField<Id extends string = string> = OptionFilterField<Id> | DateFilterField<Id>;

export type FilterClause = { operator: FilterOperator; values: readonly string[] };

export type FilterValue<Id extends string = string> = Partial<Record<Id, FilterClause>>;
