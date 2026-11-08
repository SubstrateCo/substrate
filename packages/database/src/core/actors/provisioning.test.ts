import { AccessDeniedError } from "../../errors";
import { actors, entities, member, userAgents } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { createActor, ensureHumanActor, ensureUserAgentActor } from "./provisioning";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

describe("actor provisioning", () => {
  test("concurrent user agent provisioning reuses identity and keeps workspaces isolated", async () => {
    const [agent] = await f.db
      .insert(userAgents)
      .values({
        userId: "alice",
        name: "Assistant",
        instructions: "Help",
        harness: "opencode",
      })
      .returning();
    await f.db.insert(member).values({ id: "alice-b", organizationId: f.orgB, userId: "alice" });
    const otherOwner = await ensureHumanActor(f.db, {
      organizationId: f.orgB,
      userId: "alice",
      name: "Alice",
    });
    const input = { organizationId: f.orgA, userId: "alice", userAgentId: agent!.id };
    const [first, second] = await Promise.all([
      ensureUserAgentActor(f.db, input),
      ensureUserAgentActor(f.db, input),
    ]);
    expect(first.entityId).toBe(second.entityId);
    const other = await ensureUserAgentActor(f.db, { ...input, organizationId: f.orgB });
    expect(other.entityId).not.toBe(first.entityId);
    // Each workspace's agent uses the owner's access in that workspace only.
    const otherContact = await f
      .forActor(otherOwner.entityId, f.orgB)
      .contacts.create({ displayName: "Other workspace" });
    expect(
      (await f.forActor(other.entityId, f.orgB).contacts.list()).map((item) => item.entityId),
    ).toEqual([otherContact.entityId]);
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Private" });
    await f
      .forActor(first.entityId)
      .contacts.update(contact.entityId, { displayName: "Agent edit" });
    expect((await f.forActor(f.alice).contacts.get(contact.entityId)).displayName).toBe(
      "Agent edit",
    );
    await expect(
      f.forActor(other.entityId, f.orgB).contacts.get(contact.entityId),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    const before = await f.db.select().from(entities);
    await expect(
      ensureUserAgentActor(f.db, { ...input, userAgentId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
  });

  test("database enforces user agent references, actor type, and one identity per organization", async () => {
    const [agent] = await f.db
      .insert(userAgents)
      .values({
        userId: "alice",
        name: "Assistant",
        instructions: "Help",
        harness: "opencode",
      })
      .returning();
    await ensureUserAgentActor(f.db, {
      organizationId: f.orgA,
      userId: "alice",
      userAgentId: agent!.id,
    });
    await expect(
      createActor(f.db, {
        organizationId: f.orgA,
        type: "agent",
        userAgentId: agent!.id,
        name: "Duplicate",
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    await expect(
      createActor(f.db, {
        organizationId: f.orgA,
        type: "agent",
        userAgentId: crypto.randomUUID(),
        name: "Missing",
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      f.db
        .update(actors)
        .set({ userAgentId: agent!.id })
        .where(eq(actors.entityId, f.alice))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  test("user agents use their owner's access, retain assignment identity, and lose access when inactive", async () => {
    const [agent] = await f.db
      .insert(userAgents)
      .values({
        userId: "alice",
        name: "Assistant",
        instructions: "Help",
        harness: "opencode",
      })
      .returning();
    const input = { organizationId: f.orgA, userId: "alice", userAgentId: agent!.id };
    const assistant = f.forActor((await ensureUserAgentActor(f.db, input)).entityId);
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Private" });
    const [actor] = await f.db.select().from(actors).where(eq(actors.userAgentId, agent!.id));
    const project = await f.forActor(f.alice).projects.create({ name: "Agent work" });
    const task = await f.forActor(f.alice).tasks.create({
      projectEntityId: project.entityId,
      title: "Assigned",
      assigneeActorEntityId: actor!.entityId,
    });
    expect((await assistant.tasks.get(task.entityId)).assigneeActorEntityId).toBe(actor!.entityId);
    expect((await assistant.contacts.get(contact.entityId)).displayName).toBe("Private");
    expect(
      (await assistant.contacts.update(contact.entityId, { displayName: "Changed" })).displayName,
    ).toBe("Changed");
    await ensureUserAgentActor(f.db, input);
    expect(await f.db.select().from(actors).where(eq(actors.userAgentId, agent!.id))).toHaveLength(
      1,
    );
    await expect(ensureUserAgentActor(f.db, { ...input, userId: "bob" })).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    await expect(
      ensureUserAgentActor(f.db, { ...input, organizationId: f.orgB }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await f.db.update(userAgents).set({ enabled: false }).where(eq(userAgents.id, agent!.id));
    // A disabled agent keeps its name on assigned tasks but cannot be assigned again.
    expect((await f.forActor(f.alice).projects.getDetail(project.entityId)).actors).toContainEqual({
      entityId: actor!.entityId,
      name: "Assistant",
      type: "agent",
      assignable: false,
    });
    await expect(
      f.forActor(f.alice).permissions.grant({
        entityId: contact.entityId,
        actorEntityId: actor!.entityId,
        level: "edit",
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(assistant.contacts.list()).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(ensureUserAgentActor(f.db, input)).rejects.toBeInstanceOf(AccessDeniedError);
    await f.db
      .update(userAgents)
      .set({ enabled: true, deletedAt: new Date() })
      .where(eq(userAgents.id, agent!.id));
    await expect(assistant.contacts.get(contact.entityId)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    await f.db.update(userAgents).set({ deletedAt: null }).where(eq(userAgents.id, agent!.id));
    await f.db.delete(member).where(eq(member.id, "alice-a"));
    await expect(assistant.contacts.get(contact.entityId)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });
  test("onboarding reuses human actors without changing grants or adding entities", async () => {
    const before = await f.db.select().from(entities);
    const actor = await ensureHumanActor(f.db, {
      organizationId: f.orgA,
      userId: "alice",
      name: "Alice",
    });
    expect(actor.entityId).toBe(f.alice);
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
    const privateContact = await f.forActor(f.bob).contacts.create({ displayName: "Private" });
    await expect(
      f.forActor(actor.entityId).contacts.get(privateContact.entityId),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  test("concurrent onboarding provisions one actor and rolls back invalid membership", async () => {
    await f.db.insert(member).values({ id: "alice-b", organizationId: f.orgB, userId: "alice" });
    const input = { organizationId: f.orgB, userId: "alice", name: "Alice" };
    const results = await Promise.all([
      ensureHumanActor(f.db, input),
      ensureHumanActor(f.db, input),
    ]);
    expect(results[0].entityId).toBe(results[1].entityId);
    const before = await f.db.select().from(entities);
    await expect(
      ensureHumanActor(f.db, {
        organizationId: f.orgA,
        userId: "outsider",
        name: "Outsider",
      }),
    ).rejects.toThrow("membership");
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
  });

  test("requires organization membership and cannot duplicate it", async () => {
    const before = await f.db.select().from(entities);
    await expect(
      createActor(f.db, {
        organizationId: f.orgA,
        type: "human",
        userId: "outsider",
        name: "Invalid",
      }),
    ).rejects.toThrow("membership");
    await expect(
      createActor(f.db, {
        organizationId: f.orgA,
        type: "human",
        userId: "alice",
        name: "Duplicate",
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    await f.db
      .insert(member)
      .values({ id: "alice-b", organizationId: f.orgB, userId: "alice", role: "member" });
    const actor = await createActor(f.db, {
      organizationId: f.orgB,
      type: "human",
      userId: "alice",
      name: "Alice B",
    });
    expect(actor.organizationId).toBe(f.orgB);
    expect(actor.entityId).not.toBe(f.alice);
  });

  test("database rejects invalid human and agent identity combinations", async () => {
    const [entity] = await f.db
      .insert(entities)
      .values({ organizationId: f.orgA, entityType: "actor" })
      .returning();
    const identity = { organizationId: f.orgA, entityId: entity!.entityId, name: "Invalid" };
    await expect(
      f.db
        .insert(actors)
        .values({ ...identity, type: "human" })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      f.db
        .insert(actors)
        .values({ ...identity, type: "agent", userId: "alice" })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      f.db
        .insert(actors)
        .values({ ...identity, type: "human", userId: "outsider", agentConfig: {} })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
