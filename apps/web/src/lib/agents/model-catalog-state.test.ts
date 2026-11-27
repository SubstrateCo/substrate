import type { HarnessModelCatalog } from "@substrate/contracts/harness-runtime";

import { modelCatalogState } from "./model-catalog-state";
import { describe, expect, test } from "bun:test";

const catalog = (status: HarnessModelCatalog["status"]): HarnessModelCatalog => ({
  harness: "codex",
  status,
  models: [],
  auth: { methods: [{ id: "browser", name: "Browser", type: "agent" }], signOut: false },
});
const failure = new Error("Network request failed");
const state = (input: Partial<Parameters<typeof modelCatalogState>[0]>) =>
  modelCatalogState({ desktop: true, catalog: undefined, loading: false, error: null, ...input });

describe("modelCatalogState", () => {
  test("outside the desktop app, the picker asks for the desktop before anything else", () => {
    expect(state({ desktop: false, error: failure, loading: true }).kind).toBe("desktop-required");
  });
  test("a runtime that needs a sign-in offers its methods, even after a failed refresh", () => {
    expect(state({ catalog: catalog("sign-in"), error: failure })).toEqual({
      kind: "sign-in",
      methods: [{ id: "browser", name: "Browser", type: "agent" }],
    });
  });
  test("a runtime that is not installed says so, even after a failed refresh", () => {
    expect(state({ catalog: catalog("unavailable"), error: failure }).kind).toBe("unavailable");
  });
  test("a failed load is an error, even with cached models", () => {
    expect(state({ catalog: catalog("ready"), error: failure }).kind).toBe("error");
    expect(state({ loading: true }).kind).toBe("loading");
    expect(state({ catalog: catalog("ready") }).kind).toBe("ready");
  });
});
