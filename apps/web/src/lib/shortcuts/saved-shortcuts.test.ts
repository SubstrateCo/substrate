import { defaultShortcuts } from "@substrate/contracts/desktop/shortcuts";

import { customFromSaved, savedFromCustom } from "./saved-shortcuts";
import { describe, expect, it } from "bun:test";

describe("saved shortcuts", () => {
  it("treats only keys that differ from the defaults as custom", () => {
    const saved = { ...defaultShortcuts, "app.home": ["G", "D"], "search.open": "Mod+P" };
    expect(customFromSaved(saved)).toEqual({ "app.home": ["G", "D"], "search.open": "Mod+P" });
  });

  it("saves every shortcut, with defaults for the ones the person did not change", () => {
    expect(savedFromCustom({ "app.tasks": "Mod+Shift+T" })).toEqual({
      ...defaultShortcuts,
      "app.tasks": "Mod+Shift+T",
    });
  });

  it("saves the defaults after a reset or an unbind", () => {
    expect(savedFromCustom({})).toEqual(defaultShortcuts);
    expect(savedFromCustom({ "app.home": null })).toEqual(defaultShortcuts);
  });
});
