import { taskAssignees, moveParentChoices } from "./task-access";
import { expect, test } from "bun:test";

test("task assignees exclude people without project membership but keep owned agents and the current assignee", () => {
  const actors = [
    { entityId: "member", type: "human" as const, assignable: true, name: "Member", image: null },
    { entityId: "outside", type: "human" as const, assignable: true, name: "Outside", image: null },
    { entityId: "agent", type: "agent" as const, assignable: true, name: "Agent", image: null },
    {
      entityId: "current",
      type: "agent" as const,
      assignable: false,
      name: "Current",
      image: null,
    },
  ];
  expect(
    taskAssignees(
      {
        actors,
        members: [
          { actorEntityId: "member", name: "Member", image: null, type: "human", level: "view" },
        ],
      },
      "current",
    ).map((actor) => actor.entityId),
  ).toEqual(["member", "agent", "current"]);
});

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
