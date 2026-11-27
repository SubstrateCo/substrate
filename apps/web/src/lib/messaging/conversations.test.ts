import {
  agentDirectMessage,
  conversationLabel,
  conversationName,
  humanMembers,
} from "./conversations";
import { expect, test } from "bun:test";

test("a task discussion uses its task title instead of unnamed group fallback", () => {
  expect(
    conversationName({
      kind: "group",
      name: null,
      task: { taskEntityId: "task", projectEntityId: "project", title: "Ship the launch" },
    }),
  ).toBe("Ship the launch");
});

test("only a public channel is written with a hash", () => {
  expect(conversationLabel({ kind: "channel", private: false, name: "launch" })).toBe("#launch");
  expect(conversationLabel({ kind: "channel", private: true, name: "Partner launch" })).toBe(
    "Partner launch",
  );
  expect(conversationLabel({ kind: "group", private: true, name: "Ada, Bob" })).toBe("Ada, Bob");
  expect(conversationLabel({ kind: "dm", name: "Ada" })).toBe("Ada");
});

test("only people with accounts can be chosen as owners", () => {
  expect(
    humanMembers([
      { actorId: "a1", type: "human", userId: "u1", name: "Ada", image: null, avatar: null },
      {
        actorId: "a2",
        type: "agent",
        userId: null,
        name: "Helper",
        image: null,
        avatar: "100000",
      },
    ]),
  ).toEqual([{ userId: "u1", name: "Ada" }]);
});

test("a new message to an agent reuses its joined DM, not a channel it is in", () => {
  const me = {
    actorId: "me",
    type: "human" as const,
    userId: "u1",
    name: "Ada",
    image: null,
    avatar: null,
  };
  const helper = {
    actorId: "h",
    type: "agent" as const,
    userId: null,
    agentId: "d1",
    name: "Helper",
    image: null,
    avatar: "100000",
  };
  const conversations = [
    {
      id: "channel",
      kind: "channel" as const,
      name: "x",
      private: false,
      joined: true,
      members: [me, helper],
    },
    {
      id: "ordinary-dm",
      kind: "dm" as const,
      name: null,
      private: true,
      joined: true,
      members: [me, helper],
    },
    {
      id: "left",
      kind: "agent_dm" as const,
      name: null,
      private: true,
      joined: false,
      members: [me, helper],
    },
    {
      id: "dm",
      kind: "agent_dm" as const,
      name: null,
      private: true,
      joined: true,
      members: [me, helper],
    },
  ];
  expect(agentDirectMessage(conversations, "d1")?.id).toBe("dm");
  expect(agentDirectMessage(conversations, "d2")).toBeUndefined();
});
