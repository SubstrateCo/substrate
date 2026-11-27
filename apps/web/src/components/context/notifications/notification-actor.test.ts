import { notificationActor } from "./notification-actor";
import { expect, test } from "bun:test";

test("a notification actor with a look is an agent, and an unnamed actor is someone", () => {
  expect(
    notificationActor({ actorName: "Scout", actorImage: null, actorAvatar: "100000" }),
  ).toEqual({ kind: "agent", name: "Scout", avatar: "100000" });
  expect(
    notificationActor({ actorName: null, actorImage: "/maya.png", actorAvatar: null }),
  ).toEqual({ kind: "person", name: "Someone", image: "/maya.png" });
});
