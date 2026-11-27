import { generateAvatarCode } from "@substrate/agent-avatars/config";

import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { createAgentRepository } from "./repository";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const agent = {
  name: "Helper",
  instructions: "Help",
  harness: "opencode" as const,
  enabled: true,
  useStartupDefaults: true,
};

test("saving an agent writes only its configuration fields", async () => {
  const owner = createAgentRepository(f.db, "alice");
  const saved = await owner.saveAgent(agent);
  const extra = { userId: "bob", deletedAt: new Date(), homeDeviceId: null };
  // SAFETY: the extra fields skip route parsing on purpose, to test the repository whitelist.
  await owner.saveAgent({ ...agent, ...extra, id: saved.id, name: "Renamed" } as typeof agent);
  const [row] = await f.db.select().from(userAgents).where(eq(userAgents.id, saved.id));
  expect(row).toMatchObject({ name: "Renamed", userId: "alice", deletedAt: null });
});

test("a new agent gets the look generated from its ID", async () => {
  const saved = await createAgentRepository(f.db, "alice").saveAgent(agent);
  expect(saved.avatar).toBe(generateAvatarCode(saved.id));
});

test("only the owner changes a live agent's avatar code", async () => {
  const owner = createAgentRepository(f.db, "alice");
  const saved = await owner.saveAgent(agent);
  const chosen = saved.avatar === "131005" ? "141005" : "131005";
  expect((await owner.setAvatar(saved.id, chosen)).avatar).toBe(chosen);
  expect((await owner.list()).agents[0]?.avatar).toBe(chosen);
  expect((await owner.saveAgent({ ...agent, id: saved.id })).avatar).toBe(chosen);
  expect(
    await rejection(createAgentRepository(f.db, "bob").setAvatar(saved.id, saved.avatar)),
  ).toBeInstanceOf(AccessDeniedError);
  expect((await owner.list()).agents[0]?.avatar).toBe(chosen);
  await owner.deleteAgent(saved.id);
  expect(await rejection(owner.setAvatar(saved.id, saved.avatar))).toBeInstanceOf(
    AccessDeniedError,
  );
  const [row] = await f.db.select().from(userAgents).where(eq(userAgents.id, saved.id));
  expect(row?.avatarCode).toBe(chosen);
});

test("user definitions do not require organization membership and cannot cross owners", async () => {
  await f.db.insert(user).values({ id: "solo", name: "Solo", email: "solo@example.com" });
  const owner = createAgentRepository(f.db, "solo");
  const other = createAgentRepository(f.db, "bob");
  const saved = await owner.saveAgent(agent);
  expect(saved.useStartupDefaults).toBe(true);
  expect((await other.list()).agents).toEqual([]);
  await rejection(other.saveAgent({ ...agent, id: saved.id, name: "Changed" }));
  await rejection(other.deleteAgent(saved.id));
  expect((await owner.list()).agents[0]?.name).toBe("Helper");
  const updated = await owner.saveAgent({
    ...agent,
    id: saved.id,
    name: "Updated",
    model: "test-model",
    enabled: false,
    useStartupDefaults: false,
  });
  expect(updated).toMatchObject({
    id: saved.id,
    name: "Updated",
    model: "test-model",
    enabled: false,
    useStartupDefaults: false,
  });
});

test("deletion retains identity and updates cannot restore it", async () => {
  const owner = createAgentRepository(f.db, "alice");
  const saved = await owner.saveAgent({ ...agent, model: "old-model" });
  expect(await owner.saveAgent({ ...agent, id: saved.id })).not.toHaveProperty("model");
  await owner.deleteAgent(saved.id);
  expect((await owner.list()).agents).toEqual([]);
  const [retained] = await f.db.select().from(userAgents).where(eq(userAgents.id, saved.id));
  expect(retained?.deletedAt).toBeInstanceOf(Date);
  expect(retained?.enabled).toBe(false);
  await rejection(owner.saveAgent({ ...agent, id: saved.id }));
});
