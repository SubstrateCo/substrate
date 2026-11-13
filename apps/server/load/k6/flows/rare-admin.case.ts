import type { LoadUser } from "../../types.ts";
import type { ListedConversation } from "../lib/screens/conversations.ts";
import { createWorld, type World } from "../lib/world.ts";
import { beforeEach, expect, mock, test } from "bun:test";

const users: LoadUser[] = Array.from({ length: 10 }, (_, index) => ({
  userId: `user-${index}`,
  actorEntityId: `actor-${index}`,
  organizationId: "org",
  name: `User ${index}`,
  email: `user-${index}@load.test`,
}));
const outside: LoadUser = {
  userId: "outside",
  actorEntityId: "outside-actor",
  organizationId: "other-org",
  name: "Outside helper",
  email: "outside@load.test",
};
const created: { kind: string; name?: string; private?: boolean; emails: string[] }[] = [];
const transfers: { conversationId: string; userId: string }[] = [];
const opened: string[] = [];
let createSucceeds = true;

mock.module("../lib/config.ts", () => ({ config: { mode: "coverage", vus: 2 } }));
mock.module("../lib/data.ts", () => ({ users: [...users, outside], organizations: [] }));
mock.module("../lib/client-cache.ts", () => ({ cached() {}, async invalidate() {} }));
mock.module("../lib/pacing.ts", () => ({
  async readTime() {},
  async think() {},
  async typeTime() {},
}));
mock.module("../lib/persona.ts", () => ({
  rng: { pick: <T>(rows: T[]) => rows[0], int: () => 2 },
}));
mock.module("../lib/screens/conversations.ts", () => ({
  listed: (world: World) => world.conversations,
  isGeneral: (row: { name: string }) => row.name === "general",
  async createConversation(_world: World, input: (typeof created)[number]) {
    created.push(input);
    return createSucceeds ? "ownership-fixture" : null;
  },
}));
mock.module("../lib/screens/messaging.ts", () => ({
  async showMessaging() {},
  async openConversation(_world: World, id: string) {
    opened.push(id);
  },
}));
mock.module("../lib/screens/pictures.ts", () => ({ async changeAvatar() {} }));
mock.module("../lib/screens/settings.ts", () => ({ async showSettings() {} }));
mock.module("../lib/words.ts", () => ({ word: () => "test" }));
mock.module("./rare-sharing.ts", () => ({ isOwner: () => false }));
mock.module("../lib/http.ts", () => ({
  async call(endpoint: string, input: { conversationId: string; userId: string }) {
    if (endpoint !== "messaging.conversations.owner") throw new Error(`Unexpected ${endpoint}`);
    transfers.push(input);
    return {};
  },
}));

const { ownsConversation, transferOwnership } = await import("./rare-admin.ts");
let world: World;

beforeEach(() => {
  created.length = transfers.length = opened.length = 0;
  createSucceeds = true;
  world = createWorld(users[0]!);
  world.people = [users[1]!, outside, ...users.slice(2)].map((person) => ({
    ...person,
    image: null,
  }));
  const seeded: ListedConversation = {
    id: "seeded-channel-without-helper-members",
    organizationId: "org",
    createdBy: world.userId,
    kind: "channel",
    name: "product",
    private: false,
    joined: true,
    canPost: true,
    canManage: true,
    canShare: true,
    partner: false,
    task: null,
    members: users.slice(0, 2).map((user) => ({
      actorId: user.actorEntityId!,
      type: "human",
      userId: user.userId,
      agentId: null,
      name: user.name,
      image: null,
    })),
  };
  world.conversations = [seeded];
});

test("coverage transfers a dedicated private channel even when its seeded channel has no inactive members", async () => {
  expect(ownsConversation(world)).toBe(true);
  await transferOwnership(world);
  expect(created).toEqual([
    {
      kind: "channel",
      name: "coverage-transfer-test-test",
      private: true,
      emails: [users[2]!.email],
    },
  ]);
  expect(opened).toEqual(["ownership-fixture"]);
  expect(transfers).toEqual([
    {
      conversationId: "ownership-fixture",
      userId: users[2]!.userId,
    },
  ]);
});

test("failed coverage fixture creation fails the action without transferring a seeded channel", async () => {
  createSucceeds = false;
  await expect(transferOwnership(world)).rejects.toThrow("requires its own private channel");
  expect(transfers).toEqual([]);
  expect(opened).toEqual([]);
});

test("coverage rejects active and other-organization people instead of omitting ownership transfer", async () => {
  world.people = world.people.slice(0, 2);
  await expect(transferOwnership(world)).rejects.toThrow(
    "requires an inactive organization helper",
  );
  expect(created).toEqual([]);
  expect(transfers).toEqual([]);
});
