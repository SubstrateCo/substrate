import { archivedFromFilterValue, recordFilterValue } from "./record-filters";
import { describe, expect, test } from "bun:test";

describe("record filters", () => {
  test("active records are the unfiltered default", () => {
    expect(recordFilterValue(false)).toEqual({});
    expect(archivedFromFilterValue({})).toBe(false);
  });

  test("choosing Active returns to the active records", () => {
    expect(archivedFromFilterValue({ records: { operator: "is", values: ["active"] } })).toBe(
      false,
    );
  });

  test("archived records round-trip through the filter value", () => {
    expect(archivedFromFilterValue(recordFilterValue(true))).toBe(true);
  });
});
