import { moveParentChoices } from "./task-access";
import { expect, test } from "bun:test";

test("moving a task cannot select itself or any descendant as its parent", () => {
  const task = (entityId: string, parentTaskEntityId: string | null) => ({
    entityId,
    parentTaskEntityId,
    title: entityId,
  });
  expect(
    moveParentChoices(
      [task("grandchild", "child"), task("child", "self"), task("self", null), task("other", null)],
      "self",
    ).map((row) => row.entityId),
  ).toEqual(["other"]);
});
