import { AccessDeniedError } from "../../errors";
import { createRepositories } from "../../repositories";
import { actors, entities, entityGrants, member, user, userAgents } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { rootEntityValues } from "../entities/identity";
import {
  createActor,
  ensureHumanActor,
  ensureHumanActors,
  ensureUserAgentActor,
} from "./provisioning";
import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const f = setupDatabase();

describe("actor provisioning", () => {
  test("concurrent user agent provisioning reuses identity and keeps workspaces isolated", async () => {
    const [agent] = await f.db
      .insert(userAgents)
      .values({
        userId: "alice",
        name: "Assistant",
        instructions: "Help",
        avatarCode: "100000",
        harness: "opencode",
      })
      .returning();
    await f.db.insert(member).values({ id: "alice-b", organizationId: f.orgB, userId: "alice" });
    const otherOwner = await ensureHumanActor(f.db, {
      organizationId: f.orgB,
      userId: "alice",
    });
    const input = { organizationId: f.orgA, userId: "alice", userAgentId: agent!.id };
    const entitiesBefore = await f.db.select().from(entities);
    const [first, second] = await Promise.all([
      ensureUserAgentActor(f.db, input),
      ensureUserAgentActor(f.db, input),
    ]);
    expect(first.entityId).toBe(second.entityId);
    expect(await f.db.select().from(actors).where(eq(actors.userAgentId, agent!.id))).toHaveLength(
      1,
    );
    expect(await f.db.select().from(entities)).toHaveLength(entitiesBefore.length + 1);
    const other = await ensureUserAgentActor(f.db, { ...input, organizationId: f.orgB });
    expect(other.entityId).not.toBe(first.entityId);
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
    expect(
      await rejection(f.forActor(other.entityId, f.orgB).contacts.get(contact.entityId)),
    ).toBeInstanceOf(AccessDeniedError);
    const before = await f.db.select().from(entities);
    expect(
      await rejection(ensureUserAgentActor(f.db, { ...input, userAgentId: crypto.randomUUID() })),
    ).toBeInstanceOf(AccessDeniedError);
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
  });

  test("database enforces user agent references, actor type, and one identity per organization", async () => {
    const [agent] = await f.db
      .insert(userAgents)
      .values({
        userId: "alice",
        name: "Assistant",
        instructions: "Help",
        avatarCode: "100000",
        harness: "opencode",
      })
      .returning();
    await ensureUserAgentActor(f.db, {
      organizationId: f.orgA,
      userId: "alice",
      userAgentId: agent!.id,
    });
    expect(
      await rejection(
        createActor(f.db, {
          organizationId: f.orgA,
          type: "agent",
          userAgentId: agent!.id,
        }),
      ),
    ).toMatchObject({ cause: { code: "23505" } });
    expect(
      await rejection(
        createActor(f.db, {
          organizationId: f.orgA,
          type: "agent",
          userAgentId: crypto.randomUUID(),
        }),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
    expect(
      await rejection(
        f.db
          .update(actors)
          .set({ userAgentId: agent!.id })
          .where(eq(actors.entityId, f.alice))
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23514" } });
  });

  test("user agents use their owner's access, retain assignment identity, and lose access when inactive", async () => {
    const [agent] = await f.db
      .insert(userAgents)
      .values({
        userId: "alice",
        name: "Assistant",
        instructions: "Help",
        avatarCode: "100000",
        harness: "opencode",
      })
      .returning();
    const input = { organizationId: f.orgA, userId: "alice", userAgentId: agent!.id };
    const assistant = f.forActor((await ensureUserAgentActor(f.db, input)).entityId);
    const account = await f.forActor(f.alice).crm.createAccount({ name: "Private" });
    const [actor] = await f.db.select().from(actors).where(eq(actors.userAgentId, agent!.id));
    const project = await f.forActor(f.alice).projects.create({ name: "Agent work" });
    const task = await f.forActor(f.alice).tasks.create({
      projectEntityId: project.entityId,
      title: "Assigned",
      assigneeActorEntityId: actor!.entityId,
    });
    expect((await assistant.tasks.get(task.entityId)).assigneeActorEntityId).toBe(actor!.entityId);
    expect((await assistant.crm.getAccount(account.entityId)).account.name).toBe("Private");
    expect((await assistant.crm.updateAccount(account.entityId, { name: "Changed" })).name).toBe(
      "Changed",
    );
    await ensureUserAgentActor(f.db, input);
    expect(await f.db.select().from(actors).where(eq(actors.userAgentId, agent!.id))).toHaveLength(
      1,
    );
    expect(await rejection(ensureUserAgentActor(f.db, { ...input, userId: "bob" }))).toBeInstanceOf(
      AccessDeniedError,
    );
    expect(
      await rejection(ensureUserAgentActor(f.db, { ...input, organizationId: f.orgB })),
    ).toBeInstanceOf(AccessDeniedError);
    await f.db.update(userAgents).set({ enabled: false }).where(eq(userAgents.id, agent!.id));
    expect((await f.forActor(f.alice).projects.getDetail(project.entityId)).actors).toContainEqual({
      entityId: actor!.entityId,
      name: "Assistant",
      type: "agent",
      assignable: false,
      image: null,
      avatar: "100000",
    });
    expect(
      await rejection(
        f.forActor(f.alice).permissions.grant({
          entityId: account.entityId,
          actorEntityId: actor!.entityId,
          level: "edit",
        }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    expect(
      await rejection(
        createRepositories(f.db).forSession({
          userId: "alice",
          organizationId: f.orgA,
          actorEntityId: actor!.entityId,
        }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    expect(await rejection(ensureUserAgentActor(f.db, input))).toBeInstanceOf(AccessDeniedError);
    await f.db
      .update(userAgents)
      .set({ enabled: true, deletedAt: new Date() })
      .where(eq(userAgents.id, agent!.id));
    expect(await rejection(assistant.crm.getAccount(account.entityId))).toBeInstanceOf(
      AccessDeniedError,
    );
    await f.db.update(userAgents).set({ deletedAt: null }).where(eq(userAgents.id, agent!.id));
    await f.db.delete(member).where(eq(member.id, "alice-a"));
    expect(await rejection(assistant.crm.getAccount(account.entityId))).toBeInstanceOf(
      AccessDeniedError,
    );
  });
  test("onboarding reuses human actors without changing grants or adding entities", async () => {
    const before = await f.db.select().from(entities);
    const actor = await ensureHumanActor(f.db, {
      organizationId: f.orgA,
      userId: "alice",
    });
    expect(actor.entityId).toBe(f.alice);
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
    const privateAccount = await f.forActor(f.bob).crm.createAccount({ name: "Private" });
    expect(
      await rejection(f.forActor(actor.entityId).crm.getAccount(privateAccount.entityId)),
    ).toBeInstanceOf(AccessDeniedError);
  });

  test("concurrent onboarding provisions one actor and rolls back invalid membership", async () => {
    await f.db.insert(member).values({ id: "alice-b", organizationId: f.orgB, userId: "alice" });
    const input = { organizationId: f.orgB, userId: "alice", name: "Alice" };
    const entitiesBefore = await f.db.select().from(entities);
    const grantsBefore = await f.db.select().from(entityGrants);
    const results = await Promise.all([
      ensureHumanActor(f.db, input),
      ensureHumanActor(f.db, input),
    ]);
    expect(results[0].entityId).toBe(results[1].entityId);
    expect(
      await f.db.select().from(actors).where(eq(actors.entityId, results[0].entityId)),
    ).toHaveLength(1);
    expect(await f.db.select().from(entities)).toHaveLength(entitiesBefore.length + 1);
    expect(await f.db.select().from(entityGrants)).toHaveLength(grantsBefore.length + 1);
    expect(
      await f.db.select().from(entityGrants).where(eq(entityGrants.entityId, results[0].entityId)),
    ).toMatchObject([{ actorEntityId: results[0].entityId, level: "owner" }]);
    const before = await f.db.select().from(entities);
    expect(
      await rejection(
        ensureHumanActor(f.db, {
          organizationId: f.orgA,
          userId: "outsider",
        }),
      ),
    ).toMatchObject({ message: expect.stringContaining("membership") });
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
  });

  test("concurrent bulk and single onboarding converge on one actor per person", async () => {
    const people = ["one", "two", "three"];
    await f.db
      .insert(user)
      .values(people.map((id) => ({ id, name: id, email: `${id}@example.com` })));
    await f.db
      .insert(member)
      .values(people.map((id) => ({ id: `${id}-b`, userId: id, organizationId: f.orgB })));
    const input = { organizationId: f.orgB, userIds: [...people, "outsider"] };
    const entitiesBefore = await f.db.select().from(entities);
    const grantsBefore = await f.db.select().from(entityGrants);
    const held = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const singleResult = f.db.transaction(async (tx) => {
      const actor = await ensureHumanActor(tx, { organizationId: f.orgB, userId: "two" });
      held.resolve();
      await release.promise;
      return actor;
    });
    await held.promise;
    function bulk(userIds: string[]) {
      const started = Promise.withResolvers<number>();
      const result = f.db.transaction(async (tx) => {
        const [backend] = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
        started.resolve(backend!.pid);
        return ensureHumanActors(tx, { ...input, userIds });
      });
      return { started: started.promise, result };
    }
    const forward = bulk(input.userIds);
    const reverse = bulk([...input.userIds].reverse());
    const settled = Promise.allSettled([forward.result, reverse.result, singleResult]);
    try {
      const [firstPid, secondPid] = await Promise.all([forward.started, reverse.started]);
      let blocked = 0;
      const deadline = Date.now() + 2_000;
      while (blocked < 2 && Date.now() < deadline) {
        const [row] = await f.db.execute<{ count: number }>(sql`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE pid IN (${firstPid}, ${secondPid}) AND wait_event_type = 'Lock'
        `);
        blocked = row!.count;
        if (blocked < 2) await Bun.sleep(5);
      }
      expect(blocked).toBe(2);
    } finally {
      release.resolve();
      await settled;
    }
    const [first, second, single] = await Promise.all([
      forward.result,
      reverse.result,
      singleResult,
    ]);
    const byUser = (list: { userId: string | null; entityId: string }[]) =>
      Object.fromEntries(list.map((actor) => [actor.userId, actor.entityId]));
    expect(byUser(first)).toEqual(byUser(second));
    expect(Object.keys(byUser(first)).sort()).toEqual([...people, "outsider"].sort());
    expect(byUser(first).two).toBe(single.entityId);
    expect(byUser(first).outsider).toBe(f.outsider);
    expect(await f.db.select().from(entities)).toHaveLength(entitiesBefore.length + 3);
    expect(await f.db.select().from(entityGrants)).toHaveLength(grantsBefore.length + 3);
    for (const id of people)
      expect(
        await f.db
          .select({ actorEntityId: entityGrants.actorEntityId, level: entityGrants.level })
          .from(entityGrants)
          .where(eq(entityGrants.entityId, byUser(first)[id]!)),
      ).toEqual([{ actorEntityId: byUser(first)[id]!, level: "owner" }]);
  });

  test("bulk onboarding rejects the whole batch when one person is not a member", async () => {
    await f.db.insert(user).values({ id: "carol", name: "Carol", email: "carol@example.com" });
    await f.db.insert(member).values({ id: "carol-a", userId: "carol", organizationId: f.orgA });
    const before = await f.db.select().from(entities);
    expect(
      await rejection(
        ensureHumanActors(f.db, { organizationId: f.orgA, userIds: ["carol", "outsider"] }),
      ),
    ).toMatchObject({ message: expect.stringContaining("membership") });
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    expect(await f.db.select().from(actors).where(eq(actors.userId, "carol"))).toEqual([]);
  });

  test("requires organization membership and cannot duplicate it", async () => {
    const before = await f.db.select().from(entities);
    expect(
      await rejection(
        createActor(f.db, {
          organizationId: f.orgA,
          type: "human",
          userId: "outsider",
        }),
      ),
    ).toMatchObject({ message: expect.stringContaining("membership") });
    expect(
      await rejection(
        createActor(f.db, {
          organizationId: f.orgA,
          type: "human",
          userId: "alice",
        }),
      ),
    ).toMatchObject({ cause: { code: "23505" } });
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    await f.db
      .insert(member)
      .values({ id: "alice-b", organizationId: f.orgB, userId: "alice", role: "member" });
    const actor = await createActor(f.db, {
      organizationId: f.orgB,
      type: "human",
      userId: "alice",
    });
    expect(actor.organizationId).toBe(f.orgB);
    expect(actor.entityId).not.toBe(f.alice);
  });

  test("database rejects invalid human and agent identity combinations", async () => {
    const [entity] = await f.db
      .insert(entities)
      .values(rootEntityValues(f.orgA, "actor"))
      .returning();
    const identity = { organizationId: f.orgA, entityId: entity!.entityId };
    expect(
      await rejection(
        f.db
          .insert(actors)
          .values({ ...identity, type: "human" })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23514" } });
    expect(
      await rejection(
        f.db
          .insert(actors)
          .values({ ...identity, type: "agent", userId: "alice" })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23514" } });
  });
});
