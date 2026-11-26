import {
  activeReferenceQuery,
  applyDisplayChange,
  bodyFromParts,
  displayText,
  insertReference,
  partsFromBody,
} from "./token-draft";
import { describe, expect, test } from "bun:test";

const ada = "11111111-1111-4111-8111-111111111111";
const launch = "22222222-2222-4222-8222-222222222222";
const labels = { [`person:${ada}`]: "Ada", [`channel:${launch}`]: "launch" };

describe("token draft", () => {
  test("round-trips stored tokens through display labels", () => {
    const body = `Ask @[person:${ada}] in @[channel:${launch}] today`;
    const parts = partsFromBody(body, labels);
    expect(displayText(parts)).toBe("Ask @Ada in #launch today");
    expect(bodyFromParts(parts)).toBe(body);
  });

  test("typing outside a reference keeps its token", () => {
    const parts = partsFromBody(`Hi @[person:${ada}]`, labels);
    const next = applyDisplayChange(parts, "Hi @Ada, welcome");
    expect(bodyFromParts(next)).toBe(`Hi @[person:${ada}], welcome`);
  });

  test("deleting one character of a label removes the whole reference", () => {
    const parts = partsFromBody(`Hi @[person:${ada}] there`, labels);
    const next = applyDisplayChange(parts, "Hi @Ad there");
    expect(bodyFromParts(next)).toBe("Hi  there");
  });

  test("typing inside a label removes the reference instead of corrupting the token", () => {
    const parts = partsFromBody(`@[person:${ada}]`, labels);
    const next = applyDisplayChange(parts, "@Axda");
    expect(bodyFromParts(next)).not.toContain("@[");
  });

  test("inserting a picked reference replaces the typed query", () => {
    const parts = partsFromBody("Ping @ad", labels);
    const query = activeReferenceQuery(parts, 8);
    expect(query?.query).toBe("ad");
    const { parts: next, caret } = insertReference(parts, query!, {
      kind: "person",
      id: ada,
      label: "Ada",
    });
    expect(bodyFromParts(next)).toBe(`Ping @[person:${ada}] `);
    expect(caret).toBe(displayText(next).length);
  });

  test("a label's own @ does not open the picker again", () => {
    const parts = partsFromBody(`@[person:${ada}]`, labels);
    expect(activeReferenceQuery(parts, 4)).toBeNull();
  });

  test("a selected range does not open a reference picker in the edit composer", () => {
    const parts = partsFromBody("Ask @Ada");
    // Both editor adapters report -1 instead of a caret for a selected range.
    expect(activeReferenceQuery(parts, -1)).toBeNull();
  });

  test("an unknown token keeps its ID and shows a neutral label", () => {
    const parts = partsFromBody(`@[task:${ada}]`);
    expect(displayText(parts)).toBe("@Reference");
    expect(bodyFromParts(parts)).toBe(`@[task:${ada}]`);
  });
});
