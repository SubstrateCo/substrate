import { reportPeriod } from "./report-period";
import { expect, test } from "bun:test";

test("a CRM close period includes the whole final UTC date, including month boundaries", () => {
  expect(reportPeriod("2026-11-01", "2026-11-30")).toEqual({
    from: "2026-11-01T00:00:00.000Z",
    to: "2026-12-01T00:00:00.000Z",
  });
  expect(reportPeriod("2026-11-25", "2026-11-25")).toEqual({
    from: "2026-11-25T00:00:00.000Z",
    to: "2026-11-26T00:00:00.000Z",
  });
});

test("invalid or reversed CRM close dates cannot request a report", () => {
  expect(reportPeriod("2026-02-30", "2026-03-01")).toBeNull();
  expect(reportPeriod("2026-11-30", "2026-11-01")).toBeNull();
});
