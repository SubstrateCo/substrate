import { calendarEventRange } from "./calendar/input.ts";
import { interactionFields } from "./context/interactions.ts";
import { notificationPosition } from "./context/notification-groups.ts";
import { crmReportDeals } from "./crm/report-input.ts";
import { expect, test } from "bun:test";

const organizationId = "00000000-0000-4000-8000-000000000001";
const interaction = {
  contactEntityId: organizationId,
  kind: "call",
  summary: "Review",
};

test("interaction inputs normalize explicit offsets to UTC", () => {
  expect(
    interactionFields.parse({
      ...interaction,
      occurredAt: "2026-11-22T16:00:00-05:00",
      endedAt: "2026-11-22T16:30:00-05:00",
    }),
  ).toMatchObject({
    occurredAt: "2026-11-22T21:00:00.000Z",
    endedAt: "2026-11-22T21:30:00.000Z",
  });
});

test("timestamp inputs reject wall clocks without a zone and date-only values", () => {
  for (const occurredAt of ["2026-11-22T16:00:00", "2026-11-22", "not-a-date"])
    expect(interactionFields.safeParse({ ...interaction, occurredAt }).success).toBe(false);
});

test("notification cursor normalization retains PostgreSQL microsecond precision", () => {
  const position = (at: string) => notificationPosition(JSON.stringify({ at, id: organizationId }));
  expect(position("2026-11-22T16:00:00.000001-05:00").at).toBe("2026-11-22T21:00:00.000001Z");
  expect(position("2026-11-22T21:00:00.000002Z").at).toBe("2026-11-22T21:00:00.000002Z");
});

test("calendar ranges and CRM report bounds reach services as UTC", () => {
  const range = { from: "2026-11-22T16:00:00-05:00", until: "2026-11-22T17:00:00-05:00" };
  expect(calendarEventRange.parse({ organizationId, ...range })).toMatchObject({
    from: "2026-11-22T21:00:00.000Z",
    until: "2026-11-22T22:00:00.000Z",
  });
  expect(
    crmReportDeals.parse({ organizationId, cohort: "closed", from: range.from, to: range.until }),
  ).toMatchObject({ from: "2026-11-22T21:00:00.000Z", to: "2026-11-22T22:00:00.000Z" });
});
