import {
  canAddFilter,
  clauseLabel,
  clearFilterValue,
  hasClearableFilters,
  isOptionChecked,
  operatorLabel,
  orderOptions,
  summarizeClause,
  withClause,
} from "./filter-value";
import type { FilterField, FilterValue } from "./types";
import { expect, test } from "bun:test";
import { CalendarDays, UserRound } from "lucide-react";

const assignee: FilterField<"assignee" | "period"> = {
  id: "assignee",
  label: "Assignee",
  icon: UserRound,
  kind: "option",
  multiple: true,
  pluralLabel: "people",
  options: [
    { value: "none", label: "Unassigned" },
    { value: "a", label: "Ada" },
    { value: "b", label: "Ben" },
  ],
};
const period: FilterField<"assignee" | "period"> = {
  id: "period",
  label: "Period",
  icon: CalendarDays,
  kind: "option",
  required: true,
  options: [{ value: "7d", label: "Last 7 days" }],
};
const fields = [assignee, period];

test("operator labels follow the number of values", () => {
  expect(operatorLabel("is", 1)).toBe("is");
  expect(operatorLabel("is", 2)).toBe("is any of");
  expect(operatorLabel("is not", 1)).toBe("is not");
  expect(operatorLabel("is not", 3)).toBe("is none of");
  expect(operatorLabel("is before", 1)).toBe("is before");
});

test("clearing removes optional filters and keeps required ones", () => {
  const value: FilterValue<"assignee" | "period"> = {
    assignee: { operator: "is", values: ["a"] },
    period: { operator: "is", values: ["7d"] },
  };
  expect(hasClearableFilters(fields, value)).toBe(true);
  const cleared = clearFilterValue(fields, value);
  expect(cleared).toEqual({ period: { operator: "is", values: ["7d"] } });
  expect(hasClearableFilters(fields, cleared)).toBe(false);
});

test("a filter can be added only while a field has no pill", () => {
  const periodOnly: FilterValue<"assignee" | "period"> = {
    period: { operator: "is", values: ["7d"] },
  };
  expect(canAddFilter(fields, periodOnly)).toBe(true);
  expect(canAddFilter([period], periodOnly)).toBe(false);
});

test("a clause with no values removes the field", () => {
  const value = withClause({}, "assignee", { operator: "is", values: ["a"] });
  expect(withClause(value, "assignee", { operator: "is", values: [] })).toEqual({});
});

test("one value reads as its label and several as a count", () => {
  expect(summarizeClause(assignee, { operator: "is", values: ["none"] }).text).toBe("Unassigned");
  expect(summarizeClause(assignee, { operator: "is", values: ["a", "b"] }).text).toBe("2 people");
  expect(summarizeClause(period, { operator: "is", values: ["gone", "7d"] }).text).toBe(
    "2 selected",
  );
  expect(clauseLabel(assignee, { operator: "is not", values: ["gone"] })).toBe(
    "Assignee is not Unknown",
  );
});

test("a field that ticks unchosen options ticks the options left out", () => {
  const kept = { ...assignee, checks: "unchosen" as const };
  expect(isOptionChecked(assignee, ["a"], "a")).toBe(true);
  expect(isOptionChecked(assignee, ["a"], "b")).toBe(false);
  expect(isOptionChecked(kept, ["a"], "a")).toBe(false);
  expect(isOptionChecked(kept, ["a"], "b")).toBe(true);
});

test("options chosen when the menu opened lead, and groups stay together", () => {
  const options = [
    { value: "a", label: "Ada", group: "People" },
    { value: "b", label: "Ben", group: "People" },
    { value: "c", label: "Cal", group: "People" },
    { value: "x", label: "Bot", group: "Agents" },
  ];
  expect(orderOptions(options, ["c", "x", "a"]).map((option) => option.value)).toEqual([
    "c",
    "a",
    "b",
    "x",
  ]);
});
