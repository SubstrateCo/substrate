import { describe, expect, test } from "bun:test";
import { requireMessagingOrigin, requireMessagingWorkspace } from "./messaging-policy";

describe("messaging session boundary", () => {
  test("rejects stale tabs instead of loading or writing another workspace", () => {
    expect(() => requireMessagingWorkspace("workspace-a", "workspace-b")).toThrow(
      "active workspace changed",
    );
    expect(() => requireMessagingWorkspace("workspace-a", null)).toThrow(
      "active workspace changed",
    );
    expect(requireMessagingWorkspace("workspace-a", "workspace-a")).toBe("workspace-a");
  });

  test("only accepts writes from the configured application origin", () => {
    const baseURL = "http://localhost:3000";
    for (const origin of [
      null,
      "null",
      "https://attacker.test",
      "http://localhost:4000",
      "http://localhost:3000.attacker.test",
    ]) {
      expect(() => requireMessagingOrigin(origin, baseURL)).toThrow("Invalid request origin");
    }
    expect(() => requireMessagingOrigin(baseURL, baseURL)).not.toThrow();
  });
});
