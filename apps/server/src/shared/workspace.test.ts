import { environment } from "../environment";
import { ServiceError } from "./service-result";
import { requireOrigin, requireWorkspace } from "./workspace";
import { expect, test } from "bun:test";

test("workspace scope rejects stale or absent active workspaces", () => {
  expect(requireWorkspace("one", "one")).toBe("one");
  for (const active of [undefined, null, "two"]) {
    expect(() => requireWorkspace("one", active)).toThrow(ServiceError);
    try {
      requireWorkspace("one", active);
    } catch (error) {
      expect(error).toMatchObject({ code: "WORKSPACE_CHANGED" });
    }
  }
});

test("writes require an exact trusted frontend origin", () => {
  for (const origin of [
    null,
    "null",
    "https://foreign.test",
    "https://foreign.test.attacker.test",
  ]) {
    expect(() => requireOrigin(new Headers(origin ? { origin } : {}))).toThrow(
      "Invalid request origin.",
    );
  }
  for (const origin of environment.trustedOrigins) {
    expect(() => requireOrigin(new Headers({ origin }))).not.toThrow();
    expect(() => requireOrigin(new Headers({ origin: `${origin}.attacker.test` }))).toThrow(
      ServiceError,
    );
  }
});
