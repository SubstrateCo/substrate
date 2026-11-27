import { actorIdentity, actorLabel } from "./identity";
import { expect, test } from "bun:test";

test("an agent keeps its look and never an uploaded picture; an untyped actor is a person", () => {
  expect(
    actorIdentity({ type: "agent", name: "Scout", image: "/a.png", avatar: "100000" }),
  ).toEqual({ kind: "agent", name: "Scout", avatar: "100000" });
  expect(actorIdentity({ type: "agent", name: "Scout" })).toEqual({
    kind: "agent",
    name: "Scout",
    avatar: null,
  });
  expect(actorIdentity({ name: "Ada", image: "/ada.png", avatar: "100000" })).toEqual({
    kind: "person",
    name: "Ada",
    image: "/ada.png",
  });
});

test("an accessible label names an agent as an agent", () => {
  const scout = actorIdentity({ type: "agent", name: "Scout" });
  expect(actorLabel(scout)).toBe("Scout, Agent");
  expect(actorLabel(scout, "Assigned to Scout")).toBe("Assigned to Scout, Agent");
  expect(actorLabel(actorIdentity({ name: "Ada" }))).toBe("Ada");
  expect(actorLabel(undefined, "Unassigned")).toBe("Unassigned");
});
