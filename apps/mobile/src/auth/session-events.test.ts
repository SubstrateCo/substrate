import { changeRevalidatesSession } from "./session-events";
import { describe, expect, test } from "bun:test";

describe("changeRevalidatesSession", () => {
  test("organization changes check the session again", () => {
    expect(changeRevalidatesSession("organization")).toBe(true);
  });

  test("profile and other data changes only refresh data", () => {
    for (const domain of ["profile", "agents", "messaging", "tasks"] as const) {
      expect(changeRevalidatesSession(domain)).toBe(false);
    }
  });
});
