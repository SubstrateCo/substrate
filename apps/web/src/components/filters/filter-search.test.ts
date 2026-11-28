import { matchingFilterOptions } from "./filter-search";
import type { FilterField } from "./types";
import { expect, test } from "bun:test";
import { CalendarRange, Hash } from "lucide-react";

const fields: FilterField[] = [
  {
    id: "calendar",
    label: "Source calendar",
    kind: "option",
    icon: CalendarRange,
    options: [
      { value: "customer", label: "Customer meetings", group: "Work" },
      { value: "personal", label: "Personal", group: "Home" },
    ],
  },
  { id: "count", label: "Interaction count", kind: "number", icon: Hash },
];

test("filter search finds values without first choosing a property", () => {
  expect(matchingFilterOptions(fields, " CUSTOMER ").map(({ option }) => option.value)).toEqual([
    "customer",
  ]);
  expect(matchingFilterOptions(fields, "work").map(({ option }) => option.value)).toEqual([
    "customer",
  ]);
  expect(matchingFilterOptions(fields, "calendar").map(({ option }) => option.value)).toEqual([
    "customer",
    "personal",
  ]);
});

test("filter search omits values for empty queries, missing matches and numeric fields", () => {
  expect(matchingFilterOptions(fields, "")).toEqual([]);
  expect(matchingFilterOptions(fields, "missing")).toEqual([]);
  expect(matchingFilterOptions(fields, "count")).toEqual([]);
});
