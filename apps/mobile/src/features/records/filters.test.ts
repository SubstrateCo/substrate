import {
  canAddFilter,
  chooseOption,
  clearFilters,
  dateRangeError,
  filterEntry,
  filterLabel,
  numberError,
  oneOf,
  parseNumber,
  summarizeDateRange,
  withValues,
  type DateRange,
  type DateRangeFilterField,
  type FilterField,
  type FilterValue,
  type NumberFilterField,
} from "./filters";
import { expect, test } from "bun:test";

const type: FilterField<"type"> = {
  id: "type",
  label: "Type",
  pluralLabel: "types",
  options: [
    { value: "call", label: "Call" },
    { value: "meeting", label: "Meeting" },
  ],
};
const records: FilterField<"records"> = {
  id: "records",
  label: "Records",
  required: true,
  options: [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ],
};

test("a single choice replaces the field's value", () => {
  expect(chooseOption(type, ["call"], "meeting")).toEqual(["meeting"]);
});

test("a multiple choice toggles values and keeps earlier choices in order", () => {
  const multiple = { ...type, multiple: true };
  expect(chooseOption(multiple, ["meeting"], "call")).toEqual(["meeting", "call"]);
  expect(chooseOption(multiple, ["meeting", "call"], "meeting")).toEqual(["call"]);
  expect(chooseOption(multiple, ["call"], "call")).toEqual([]);
});

test("a required multiple choice keeps its last value", () => {
  expect(chooseOption({ ...records, multiple: true }, ["active"], "active")).toEqual(["active"]);
});

test("an emptied field is removed from the value", () => {
  const value: FilterValue<"type"> = { type: ["call"] };
  expect(withValues(value, "type", [])).toEqual({});
});

test("clearing removes optional filters and keeps required ones", () => {
  const fields: FilterField<"type" | "records">[] = [type, records];
  const value: FilterValue<"type" | "records"> = { type: ["call"], records: ["archived"] };
  expect(clearFilters(fields, value)).toEqual({
    records: ["archived"],
  });
});

test("a filter can be added only while some field has no pill", () => {
  const fields: FilterField<"type" | "records">[] = [type, records];
  const some: FilterValue<"type" | "records"> = { records: ["active"], type: [] };
  const all: FilterValue<"type" | "records"> = { records: ["active"], type: ["call"] };
  expect(canAddFilter(fields, some)).toBe(true);
  expect(canAddFilter(fields, all)).toBe(false);
});

test("a pill names its field, operator and value", () => {
  const option = (value: string[]) => filterLabel({ kind: "option", field: type, value });
  expect(option(["meeting"])).toBe("Type is Meeting");
  expect(option(["call", "meeting"])).toBe("Type is any of 2 types");
  expect(option(["gone"])).toBe("Type is Unknown");
});

const close: DateRangeFilterField<"close"> = {
  id: "close",
  label: "Close date",
  kind: "date-range",
};
const stale: NumberFilterField<"stale"> = {
  id: "stale",
  label: "Stale after",
  kind: "number",
  min: 1,
  max: 3650,
  unit: { one: "day", other: "days" },
};

test("a date range needs two real dates in order", () => {
  expect(dateRangeError({ from: "2026-11-01", through: "2026-11-01" })).toBeNull();
  expect(dateRangeError({ from: "2026-11-02", through: "2026-11-01" })).toBe(
    "The end date must be on or after the start date.",
  );
  expect(dateRangeError({ from: "2026-02-30", through: "2026-03-01" })).toBe(
    "Use real dates, like 2026-12-31.",
  );
  expect(dateRangeError({ from: "", through: "2026-03-01" })).not.toBeNull();
});

test("a date range summary drops the parts both ends share", () => {
  expect(summarizeDateRange({ from: "2026-11-01", through: "2026-11-26" })).toBe(
    "Nov 1 – 26, 2026",
  );
  expect(summarizeDateRange({ from: "2026-11-28", through: "2026-12-03" })).toBe(
    "Nov 28 – Dec 3, 2026",
  );
  expect(summarizeDateRange({ from: "2026-12-30", through: "2027-01-02" })).toBe(
    "Dec 30, 2026 – Jan 2, 2027",
  );
  expect(summarizeDateRange({ from: "2026-11-01", through: "2026-11-01" })).toBe("Nov 1, 2026");
});

test("a number must be a whole number within the field's bounds", () => {
  expect(parseNumber(stale, "30")).toBe(30);
  expect(parseNumber(stale, " 3650 ")).toBe(3650);
  for (const text of ["", "0", "3651", "2.5", "-1", "1e3", "ten"])
    expect(parseNumber(stale, text)).toBeNull();
  expect(numberError(stale, "0")).toBe("Use a whole number from 1 to 3650.");
});

test("range and number pills read with their operator and unit", () => {
  const range = { from: "2026-11-01", through: "2026-11-26" };
  expect(filterLabel({ kind: "date-range", field: close, value: range })).toBe(
    "Close date is between Nov 1 – 26, 2026",
  );
  expect(filterLabel({ kind: "number", field: stale, value: 30 })).toBe("Stale after is 30 days");
  expect(filterLabel({ kind: "number", field: stale, value: 1 })).toBe("Stale after is 1 day");
});

test("a field's value pairs with its kind, and an empty list is no filter", () => {
  const value: ClearableReport = { stale: 30 };
  expect(filterEntry(stale, value)).toEqual({ kind: "number", field: stale, value: 30 });
  expect(filterEntry(close, value)).toBeUndefined();
  const types: FilterValue<"type"> = { type: [] };
  expect(filterEntry(type, types)).toBeUndefined();
});

type ClearableReport = { close?: DateRange; stale: number };

test("clearing removes an optional range and keeps a required number", () => {
  const value: ClearableReport = {
    close: { from: "2026-11-01", through: "2026-11-26" },
    stale: 30,
  };
  expect(clearFilters([close, { ...stale, required: true }], value)).toEqual({ stale: 30 });
});

test("an unknown value reads as no filter", () => {
  expect(oneOf(["meeting"], ["call", "meeting"] as const)).toBe("meeting");
  expect(oneOf(["gone"], ["call", "meeting"] as const)).toBeUndefined();
  expect(oneOf(undefined, ["call", "meeting"] as const)).toBeUndefined();
});
