import { clearFiltersLabel, meetingFilterPatch, meetingFilterValue } from "./meeting-filters";
import { describe, expect, test } from "bun:test";

describe("meeting filters", () => {
  test("the calendar ignores a day left in the URL", () => {
    expect(meetingFilterValue({ source: "hex", day: "2026-11-18" }, "calendar")).toEqual({
      source: { operator: "is", values: ["hex"] },
    });
  });

  test("removing every pill clears source and day and returns to the first page", () => {
    expect(meetingFilterPatch({}, "all")).toEqual({
      source: undefined,
      day: undefined,
      offset: 0,
    });
  });

  test("a calendar change leaves the day untouched", () => {
    const patch = meetingFilterPatch({ source: { operator: "is", values: ["meet"] } }, "calendar");
    expect(patch).toEqual({ source: "meet", offset: 0 });
  });

  test("an unknown source value does not reach the URL", () => {
    expect(
      meetingFilterPatch({ source: { operator: "is", values: ["zoom"] } }, "all").source,
    ).toBeUndefined();
  });

  test("the reset label names what it clears", () => {
    expect(clearFiltersLabel({ q: "latch" })).toBe("Clear search");
    expect(clearFiltersLabel({ source: "hex" })).toBe("Clear filters");
    expect(clearFiltersLabel({ q: "latch", day: "2026-11-18" })).toBe("Clear search and filters");
  });
});
