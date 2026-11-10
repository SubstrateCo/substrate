import {
  agentDirectMessage,
  conversationAgentOptions,
  conversationLabel,
  humanMembers,
} from "./conversations";
import { expect, test } from "bun:test";

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
      { actorId: "a1", type: "human", userId: "u1", name: "Ada" },
      { actorId: "a2", type: "agent", userId: null, name: "Helper" },
    ]),
  ).toEqual([{ userId: "u1", name: "Ada" }]);
});

test("a new message to an agent reuses its joined DM, not a channel it is in", () => {
  const me = { actorId: "me", type: "human" as const, userId: "u1", name: "Ada" };
  const helper = {
    actorId: "h",
    type: "agent" as const,
    userId: null,
    agentId: "d1",
    name: "Helper",
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
      id: "left",
      kind: "dm" as const,
      name: null,
      private: true,
      joined: false,
      members: [me, helper],
    },
    {
      id: "dm",
      kind: "dm" as const,
      name: null,
      private: true,
      joined: true,
      members: [me, helper],
    },
  ];
  expect(agentDirectMessage(conversations, "d1")?.id).toBe("dm");
  expect(agentDirectMessage(conversations, "d2")).toBeUndefined();
});

test("agent options match members by definition ID, hide disabled agents, hide disabled agents, and keep unmatched members removable", () => {
  expect(
    conversationAgentOptions(
      [
        { id: "d1", name: "Helper", enabled: true },
        { id: "d2", name: "Writer", enabled: true },
        { id: "d3", name: "Off", enabled: false },
      ],
      [
        { id: "actor-helper", title: "Renamed helper", agentId: "d1" },
        { id: "actor-off", title: "Off", agentId: "d3" },
      ],
    ),
  ).toEqual([
    { agentId: "d1", name: "Helper", actorId: "actor-helper" },
    { agentId: "d2", name: "Writer", actorId: undefined },
    { agentId: "d3", name: "Off", actorId: "actor-off" },
  ]);
});
