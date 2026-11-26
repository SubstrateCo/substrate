import type { ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

/** Operators for an option field. "is not" excludes the chosen values. */
type OptionFilterOperator = "is" | "is not";
/** Operators for a date field. "is before" and "is after" exclude the chosen day. */
type DateFilterOperator = "is" | "is before" | "is after";
export type FilterOperator = OptionFilterOperator | DateFilterOperator;

/** One choice in an option field. `icon` is a small leading mark, such as a lucide icon or a `PersonAvatar size="xs"`. */
export type FilterOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  /** A heading the option sits under. Options with the same group should be adjacent. */
  group?: string;
};

type FilterFieldBase<Id extends string> = {
  id: Id;
  /** Sentence case, singular: "Assignee", "Status". */
  label: string;
  icon: LucideIcon;
  /** The pill shows without a remove button, and clearing keeps it. Give it a value at all times. */
  required?: boolean;
};

export type OptionFilterField<Id extends string = string> = FilterFieldBase<Id> & {
  kind: "option";
  /** Several values can be chosen. The menu stays open and shows checkboxes. */
  multiple?: boolean;
  /**
   * Which options a multiple-choice menu ticks. `"unchosen"` ticks the options left out of the
   * clause, so an "is not" field can tick what stays, as the calendar list ticks shown
   * calendars. Defaults to `"chosen"`.
   */
  checks?: "chosen" | "unchosen";
  options: readonly FilterOption[];
  /** Supported operators; the first is the default. Defaults to `["is"]`. */
  operators?: readonly OptionFilterOperator[];
  /** Lowercase plural noun for a count summary: "3 calendars". Defaults to "3 selected". */
  pluralLabel?: string;
  /** The options are still loading. */
  loading?: boolean;
  /** The options failed to load. A short sentence such as "Couldn't load calendars." */
  error?: string;
  /** Shown when the field has no options. Defaults to "Nothing to choose yet." */
  emptyLabel?: string;
};

export type DateFilterField<Id extends string = string> = FilterFieldBase<Id> & {
  kind: "date";
  /** Supported operators; the first is the default. Defaults to `["is"]`. */
  operators?: readonly DateFilterOperator[];
};

export type FilterField<Id extends string = string> = OptionFilterField<Id> | DateFilterField<Id>;

/**
 * One field's filter. Option fields hold option values; date fields hold one `YYYY-MM-DD` day.
 * A clause with no values does not exist: the field is absent from the value instead.
 */
export type FilterClause = { operator: FilterOperator; values: readonly string[] };

/** Active filters keyed by field ID. Clauses are AND-combined, one per field. */
export type FilterValue<Id extends string = string> = Partial<Record<Id, FilterClause>>;
