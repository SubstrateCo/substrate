import { oneOf, type DateRange, type FilterOption } from "./filters";
import { reportPeriod } from "./crm/report-period";

/** The CRM report's filter bar value. Close date and stale days always have a value. */
export type ReportFilterValue = {
  close: DateRange;
  stage?: readonly string[];
  owner?: readonly string[];
  outcome?: readonly string[];
  currency?: readonly string[];
  stale: number;
};

/** The report filters the server reads, beside the close period. */
export type ReportFilters = {
  stageId?: string;
  ownerActorEntityId?: string;
  currency?: string;
  outcome?: "open" | "won" | "lost";
  staleDays: number;
};

export const staleDayBounds = { min: 1, max: 3650 } as const;
const outcomes = ["open", "won", "lost"] as const;
const currencyCode = /^[A-Z]{3}$/;

/** This month so far, and deals stale after 30 days. */
export function initialReportFilters(today: string): ReportFilterValue {
  return { close: { from: `${today.slice(0, 7)}-01`, through: today }, stale: 30 };
}

/**
 * The report's request inputs. `period` is the UTC close period, or null when the dates are not
 * a valid range. `valid` is false when any input can't be sent.
 */
export function reportRequest(value: ReportFilterValue) {
  const period = reportPeriod(value.close.from, value.close.through);
  const stage = value.stage?.[0];
  const owner = value.owner?.[0];
  const currency = value.currency?.[0];
  const outcome = oneOf(value.outcome, outcomes);
  const filters: ReportFilters = { staleDays: value.stale };
  if (stage) filters.stageId = stage;
  if (owner) filters.ownerActorEntityId = owner;
  if (currency) filters.currency = currency;
  if (outcome) filters.outcome = outcome;
  const valid =
    !!period &&
    (currency === undefined || currency === "unknown" || currencyCode.test(currency)) &&
    Number.isInteger(value.stale) &&
    value.stale >= staleDayBounds.min &&
    value.stale <= staleDayBounds.max;
  return { period, filters, valid };
}

/** Known currency codes, sorted and without repeats, then "Unknown" for deals without one. */
export function currencyOptions(known: readonly (string | null | undefined)[]): FilterOption[] {
  const codes = [
    ...new Set(known.filter((code): code is string => !!code && currencyCode.test(code))),
  ].sort();
  return [
    ...codes.map((code) => ({ value: code, label: code })),
    { value: "unknown", label: "Unknown" },
  ];
}
