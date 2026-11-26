import { interactionScopeMode, interactionScopeValue } from "./interaction-scope";
import { describe, expect, test } from "bun:test";

describe("interaction scope", () => {
  test("a chosen scope selects its timeline mode", () => {
    expect(interactionScopeMode(interactionScopeValue("participants"), "linked")).toBe(
      "participants",
    );
  });

  test("a missing or unknown scope keeps the current mode", () => {
    expect(interactionScopeMode({}, "linked")).toBe("linked");
    expect(
      interactionScopeMode({ scope: { operator: "is", values: ["everyone"] } }, "participants"),
    ).toBe("participants");
  });
});
