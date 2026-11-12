import { callDropReason } from "./calls";
import { expect, test } from "bun:test";

test("dropped calls explain whether access was revoked or the desktop needs an update", () => {
  expect(callDropReason("revoked")).toBe("Revoked");
  expect(callDropReason("desktop_needs_update")).toBe("Desktop needs update");
});

test("missing and unrecognized audit results do not invent a drop reason", () => {
  expect(callDropReason(null)).toBeNull();
  expect(callDropReason("other")).toBeNull();
});
