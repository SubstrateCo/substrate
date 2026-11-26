import { currencyOptions, initialReportFilters, reportRequest } from "./crm-report-filters";
import { expect, test } from "bun:test";

test("the default report covers this month in UTC and sends only stale days", () => {
  expect(reportRequest(initialReportFilters("2026-11-26"))).toEqual({
    period: { from: "2026-11-01T00:00:00.000Z", to: "2026-11-27T00:00:00.000Z" },
    filters: { staleDays: 30 },
    valid: true,
  });
});

test("chosen filters map to the report's request fields", () => {
  const request = reportRequest({
    ...initialReportFilters("2026-11-26"),
    stage: ["stage-1"],
    owner: ["owner-1"],
    outcome: ["won"],
    currency: ["unknown"],
    stale: 3650,
  });
  expect(request.filters).toEqual({
    stageId: "stage-1",
    ownerActorEntityId: "owner-1",
    outcome: "won",
    currency: "unknown",
    staleDays: 3650,
  });
  expect(request.valid).toBe(true);
});

test("an unknown outcome reads as no outcome filter", () => {
  const request = reportRequest({ ...initialReportFilters("2026-11-26"), outcome: ["gone"] });
  expect(request.filters).toEqual({ staleDays: 30 });
});

test("a value the server would reject disables the report", () => {
  const base = initialReportFilters("2026-11-26");
  expect(
    reportRequest({ ...base, close: { from: "2026-11-27", through: "2026-11-26" } }),
  ).toMatchObject({ period: null, valid: false });
  expect(reportRequest({ ...base, currency: ["usd"] }).valid).toBe(false);
  expect(reportRequest({ ...base, stale: 0 }).valid).toBe(false);
  expect(reportRequest({ ...base, stale: 3651 }).valid).toBe(false);
  expect(reportRequest({ ...base, stale: 2.5 }).valid).toBe(false);
});

test("currency options list known codes once, in order, then Unknown", () => {
  expect(currencyOptions(["USD", null, "EUR", "USD", undefined, "bad"])).toEqual([
    { value: "EUR", label: "EUR" },
    { value: "USD", label: "USD" },
    { value: "unknown", label: "Unknown" },
  ]);
});
