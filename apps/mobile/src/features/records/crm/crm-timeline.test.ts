import { timelineCursor } from "./crm-timeline";
import { expect, test } from "bun:test";

test("a full CRM timeline page continues from the last interaction's time and ID", () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({
    entityId: `interaction-${index}`,
    occurredAt: "2026-11-25T12:00:00.000Z",
  }));
  expect(timelineCursor(rows)).toEqual({
    beforeOccurredAt: "2026-11-25T12:00:00.000Z",
    beforeEntityId: "interaction-49",
  });
  expect(timelineCursor(rows.slice(0, 49))).toBeUndefined();
  expect(timelineCursor([])).toBeUndefined();
});
