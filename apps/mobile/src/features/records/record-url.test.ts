import { mobileRouteFromUrl } from "../../lib/record-links";
import { calendarRecordURL, recordURL } from "./record-url";
import { expect, test } from "bun:test";

test("shared CRM links use desktop URL fields and round-trip to the same scoped mobile record", () => {
  for (const kind of ["account", "deal", "contact", "interaction"] as const) {
    const url = recordURL("org-one", { kind, id: "record-one" }, "https://workspace.example");
    const route = mobileRouteFromUrl(url, "https://workspace.example");
    expect(route).not.toBeNull();
    const params = new URL(route!, "https://mobile.invalid").searchParams;
    expect(params.get("workspaceId")).toBe("org-one");
    expect(JSON.parse(params.get("record")!)).toEqual({ kind, id: "record-one" });
  }
});

test("without a configured web origin, shared links still open the installed mobile app", () => {
  const url = recordURL("org-one", { kind: "deal", id: "record-one" });
  expect(url).toStartWith("substrate-mobile://crm?");
  expect(mobileRouteFromUrl(url)).toContain("workspaceId=org-one");
});

test("calendar links open the existing scoped web calendar, never an unsupported mobile route", () => {
  const url = new URL(calendarRecordURL("org-one", "event-one", "https://workspace.example"));
  expect(url.pathname).toBe("/calendar");
  expect(url.searchParams.get("eventId")).toBe("event-one");
  expect(url.searchParams.get("workspaceId")).toBe("org-one");
  expect(() => calendarRecordURL("org-one", "event-one")).toThrow();
  expect(() =>
    recordURL("org", { kind: "contact", id: "one" }, "https://user:secret@example.test"),
  ).toThrow();
});
