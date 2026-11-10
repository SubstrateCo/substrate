import { attachedWork } from "./attached-work";
import { expect, test } from "bun:test";

const link = (entityId: string, purpose: string, canRemove = false) => ({
  entityId,
  purpose,
  canRemove,
});

test("mentions are not repeated under the message", () => {
  expect(attachedWork([link("a", "mention"), link("b", "association", true)])).toEqual([
    link("b", "association", true),
  ]);
});

test("a record linked for several reasons shows once, keeps its source, and stays removable", () => {
  expect(
    attachedWork([link("a", "source"), link("a", "mention"), link("a", "association", true)]),
  ).toEqual([link("a", "source", true)]);
});
