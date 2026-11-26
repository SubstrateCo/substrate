import { assignableActors, grantCandidates, isLastOwner } from "./project-access";
import { expect, test } from "bun:test";

const actors = [
  { entityId: "member", type: "human" as const, assignable: true },
  { entityId: "outside", type: "human" as const, assignable: false },
  { entityId: "agent", type: "agent" as const, assignable: true },
  { entityId: "current", type: "agent" as const, assignable: false },
];
const members = [{ actorEntityId: "member", level: "owner" as const }];

test("task assignees follow the server's assignable flag and keep the current assignee", () => {
  expect(assignableActors({ actors }, "current").map((actor) => actor.entityId)).toEqual([
    "member",
    "agent",
    "current",
  ]);
});

test("only people who are not yet members can be given project access", () => {
  expect(grantCandidates({ actors, members }).map((actor) => actor.entityId)).toEqual(["outside"]);
});

test("the last owner is protected until another owner exists", () => {
  expect(isLastOwner(members, "member")).toBe(true);
  const owners = [...members, { actorEntityId: "outside", level: "owner" as const }];
  expect(isLastOwner(owners, "member")).toBe(false);
  expect(isLastOwner([...members, { actorEntityId: "viewer", level: "view" }], "viewer")).toBe(
    false,
  );
});
