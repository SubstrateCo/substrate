import { permissionRequest } from "./permission-request.ts";
import { expect, test } from "bun:test";

const allow = { optionId: "allow", kind: "allow_once" };
const rejectOnce = { optionId: "reject", kind: "reject_once" };
const rejectAlways = { optionId: "reject-all", kind: "reject_always" };

test("no-ask prefers one-time rejection, then persistent rejection, then cancellation", () => {
  for (const [options, outcome] of [
    [[allow, rejectAlways, rejectOnce], { outcome: "selected", optionId: "reject" }],
    [[allow, rejectAlways], { outcome: "selected", optionId: "reject-all" }],
    [[allow], { outcome: "cancelled" }],
  ] as const) {
    const request = permissionRequest({ sessionId: "session", options: [...options] });
    expect(request.deny()).toEqual({ outcome });
  }
});

test("answers must select an offered ID; absent answers and interrupts cancel", () => {
  const data = { sessionId: "session", options: [allow, rejectOnce], title: "Run tool" };
  const request = permissionRequest(data);
  expect(request.data).toBe(data);
  expect(request.parse("allow")).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });
  expect(request.parse(null)).toEqual({ outcome: { outcome: "cancelled" } });
  expect(request.parse(undefined)).toEqual({ outcome: { outcome: "cancelled" } });
  expect(request.cancelled()).toEqual({ outcome: { outcome: "cancelled" } });
  expect(() => request.parse("unoffered")).toThrow(
    "Choose one of the native permission option IDs.",
  );
});
