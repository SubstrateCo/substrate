import { harnessModelCatalogSchema, harnessSignInStateSchema } from "./models.ts";
import { describe, expect, test } from "bun:test";

describe("harness model catalog", () => {
  test("a sign-in catalog keeps launch arguments and environment of its methods out", () => {
    const parsed = harnessModelCatalogSchema.parse({
      harness: "claude",
      status: "sign-in",
      models: [],
      auth: {
        methods: [
          { id: "login", name: "Log in", type: "terminal", args: ["/login"], env: { A: "1" } },
        ],
        signOut: false,
      },
    });
    expect(parsed.auth?.methods).toEqual([{ id: "login", name: "Log in", type: "terminal" }]);
  });

  test("rejects unknown statuses and method types", () => {
    const catalog = { harness: "claude", status: "ready", models: [] };
    expect(harnessModelCatalogSchema.safeParse({ ...catalog, status: "signed-out" }).success).toBe(
      false,
    );
    expect(
      harnessModelCatalogSchema.safeParse({
        ...catalog,
        auth: { methods: [{ id: "x", name: "X", type: "env_var" }], signOut: false },
      }).success,
    ).toBe(false);
  });

  test("a sign-in state carries no process details", () => {
    const parsed = harnessSignInStateSchema.parse({
      loginId: "a",
      harness: "claude",
      type: "terminal",
      status: "running",
      output: "Open https://claude.ai",
      cursor: 22,
      command: "C:\\agent.exe",
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "cursor",
      "harness",
      "loginId",
      "output",
      "status",
      "type",
    ]);
  });
});
