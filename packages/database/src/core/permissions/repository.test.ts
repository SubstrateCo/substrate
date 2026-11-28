import { AccessDeniedError, ValidationError, type PermissionLevel } from "../../index";
import { ActorRepositories } from "../../repositories";
import { actors, entityGrants, member } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { createActor } from "../actors/provisioning";
import { describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

const f = setupDatabase();

describe("access controls", () => {
  test("organization admin cannot automatically read private entities", async () => {
    const account = await f.forActor(f.alice).crm.createAccount({ name: "Private" });
    expect(await rejection(f.forActor(f.bob).crm.getAccount(account.entityId))).toBeInstanceOf(
      AccessDeniedError,
    );
    expect(await f.forActor(f.bob).crm.listAccounts()).toEqual([]);
  });

  test("rejects invalid permission levels from untyped callers", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Private" });
    // SAFETY: Deliberately empty test input; grant must reject it rather than revoke ownership.
    const emptyLevel = "" as PermissionLevel;
    expect(() =>
      repo.permissions.grant({
        entityId: contact.entityId,
        actorEntityId: f.alice,
        level: emptyLevel,
      }),
    ).toThrow("Unknown permission level");
    expect(await f.accessLevel(f.alice, contact.entityId)).toBe("owner");
  });

  test("enforces the view, comment, edit, owner hierarchy", async () => {
    const owner = f.forActor(f.alice);
    const other = f.forActor(f.bob);
    const account = await owner.crm.createAccount({ name: "Original" });
    for (const level of ["view", "comment", "edit"] as const) {
      await owner.permissions.grant({ entityId: account.entityId, actorEntityId: f.bob, level });
      expect((await other.crm.getAccount(account.entityId)).account.name).toBe("Original");
      expect(await f.accessLevel(f.bob, account.entityId)).toBe(level);
      expect(
        await rejection(
          other.permissions.grant({
            entityId: account.entityId,
            actorEntityId: f.bob,
            level: "owner",
          }),
        ),
      ).toBeInstanceOf(AccessDeniedError);
      if (level !== "edit") {
        expect(
          await rejection(other.crm.updateAccount(account.entityId, { name: "Changed" })),
        ).toBeInstanceOf(AccessDeniedError);
      }
    }
    expect((await other.crm.updateAccount(account.entityId, { name: "Changed" })).name).toBe(
      "Changed",
    );
    await owner.permissions.revoke({ entityId: account.entityId, actorEntityId: f.bob });
    expect(await rejection(other.crm.getAccount(account.entityId))).toBeInstanceOf(
      AccessDeniedError,
    );
  });

  test("cannot revoke or downgrade the last owner", async () => {
    const repo = f.forActor(f.alice);
    const account = await repo.crm.createAccount({ name: "Owned" });
    expect(
      await rejection(
        repo.permissions.revoke({ entityId: account.entityId, actorEntityId: f.alice }),
      ),
    ).toMatchObject({ message: expect.stringContaining("last owner") });
    expect(
      await rejection(
        repo.permissions.grant({
          entityId: account.entityId,
          actorEntityId: f.alice,
          level: "view",
        }),
      ),
    ).toMatchObject({ message: expect.stringContaining("last owner") });
    await repo.permissions.grant({
      entityId: account.entityId,
      actorEntityId: f.bob,
      level: "owner",
    });
    const { db, queries } = recordQueries();
    queries.length = 0;
    await new ActorRepositories(db, {
      organizationId: f.orgA,
      actorEntityId: f.alice,
    }).permissions.revoke({ entityId: account.entityId, actorEntityId: f.alice });
    expect(queries).toHaveLength(5);
    expect(await f.accessLevel(f.bob, account.entityId)).toBe("owner");
  });

  test("unchanged grants and missing revocations write nothing, but still validate the target", async () => {
    const alice = f.forActor(f.alice);
    const account = await alice.crm.createAccount({ name: "Shared" });
    const unshared = await alice.crm.createAccount({ name: "Unshared" });
    await alice.permissions.grant({
      entityId: account.entityId,
      actorEntityId: f.bob,
      level: "view",
    });
    // xmin changes with every row version, including an upsert that writes the same level.
    const grantRow = () =>
      f.db
        .select({ version: sql<string>`xmin::text`, level: entityGrants.level })
        .from(entityGrants)
        .where(
          and(eq(entityGrants.entityId, account.entityId), eq(entityGrants.actorEntityId, f.bob)),
        );
    const [before] = await grantRow();
    const { db, queries } = recordQueries();
    const repos = new ActorRepositories(db, { organizationId: f.orgA, actorEntityId: f.alice });
    const granted = await repos.transaction((tx) =>
      tx.permissions.grant({ entityId: account.entityId, actorEntityId: f.bob, level: "view" }),
    );
    expect(queries).toHaveLength(4);
    expect(granted.hints).toEqual([]);
    expect(await grantRow()).toEqual([before!]);
    queries.length = 0;
    const revoked = await repos.transaction((tx) =>
      tx.permissions.revoke({ entityId: unshared.entityId, actorEntityId: f.bob }),
    );
    expect(queries).toHaveLength(3);
    expect(revoked.hints).toEqual([]);
    expect(queries.filter((query) => /^(insert|update|delete)\b/i.test(query))).toEqual([
      expect.stringContaining('update "entities" set "access_version"'),
    ]);
    await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
    expect(
      await rejection(
        alice.permissions.grant({
          entityId: account.entityId,
          actorEntityId: f.bob,
          level: "view",
        }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    expect(await grantRow()).toEqual([before!]);
  });

  test("grants and revocations on a child reject; the container keeps its last owner", async () => {
    const alice = f.forActor(f.alice);
    const project = await alice.projects.create({ name: "Container" });
    const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Child" });
    expect(
      await rejection(
        alice.permissions.grant({ entityId: task.entityId, actorEntityId: f.bob, level: "owner" }),
      ),
    ).toBeInstanceOf(ValidationError);
    expect(
      await rejection(
        alice.permissions.revoke({ entityId: task.entityId, actorEntityId: f.alice }),
      ),
    ).toBeInstanceOf(ValidationError);
    expect(
      await f.db.select().from(entityGrants).where(eq(entityGrants.entityId, task.entityId)),
    ).toEqual([]);
    expect(
      await rejection(
        alice.permissions.revoke({ entityId: project.entityId, actorEntityId: f.alice }),
      ),
    ).toMatchObject({ message: expect.stringContaining("last owner") });
    expect(await f.accessLevel(f.alice, task.entityId)).toBe("owner");
  });

  test("concurrent owners cannot revoke each other and leave an unowned entity", async () => {
    const alice = f.forActor(f.alice);
    const bob = f.forActor(f.bob);
    const account = await alice.crm.createAccount({ name: "Owned" });
    await alice.permissions.grant({
      entityId: account.entityId,
      actorEntityId: f.bob,
      level: "owner",
    });
    const results = await Promise.allSettled([
      alice.permissions.revoke({ entityId: account.entityId, actorEntityId: f.bob }),
      bob.permissions.revoke({ entityId: account.entityId, actorEntityId: f.alice }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const grants = await f.db
      .select()
      .from(entityGrants)
      .where(eq(entityGrants.entityId, account.entityId));
    expect(grants).toHaveLength(1);
    expect(grants[0]!.level).toBe("owner");
  });

  test("rejects forged scope and cross-organization grants", async () => {
    const account = await f.forActor(f.alice).crm.createAccount({ name: "Private" });
    const otherOrganization = f.forActor(f.outsider, f.orgB);
    expect(await rejection(otherOrganization.crm.getAccount(account.entityId))).toBeInstanceOf(
      AccessDeniedError,
    );
    expect(
      await rejection(otherOrganization.crm.updateAccount(account.entityId, { name: "Changed" })),
    ).toBeInstanceOf(AccessDeniedError);
    expect(await otherOrganization.crm.listAccounts()).toEqual([]);
    expect(await rejection(f.forActor(f.outsider).crm.getAccount(account.entityId))).toBeInstanceOf(
      AccessDeniedError,
    );
    expect(
      await rejection(f.forActor(f.alice, f.orgB).crm.createAccount({ name: "Wrong org" })),
    ).toBeInstanceOf(AccessDeniedError);
    expect(
      await rejection(
        f.forActor(f.alice).permissions.grant({
          entityId: account.entityId,
          actorEntityId: f.outsider,
          level: "view",
        }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
  });

  test("membership removal invalidates existing repository scopes", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Private" });
    await f.db.delete(member).where(eq(member.id, "alice-a"));
    expect(await rejection(repo.contacts.get(contact.entityId))).toBeInstanceOf(AccessDeniedError);
    expect(await rejection(repo.contacts.create({ displayName: "Blocked" }))).toBeInstanceOf(
      AccessDeniedError,
    );
  });

  test("agents without a user owner cannot receive grants or access records", async () => {
    const agent = await createActor(f.db, {
      organizationId: f.orgA,
      type: "agent",
    });
    const account = await f.forActor(f.alice).crm.createAccount({ name: "Customer" });
    expect(
      await rejection(f.forActor(agent.entityId).crm.getAccount(account.entityId)),
    ).toBeInstanceOf(AccessDeniedError);
    expect(
      await rejection(
        f.forActor(f.alice).permissions.grant({
          entityId: account.entityId,
          actorEntityId: agent.entityId,
          level: "edit",
        }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    expect(
      await rejection(f.forActor(agent.entityId).crm.createAccount({ name: "Blocked" })),
    ).toBeInstanceOf(AccessDeniedError);
    await f.db
      .update(actors)
      .set({ disabledAt: new Date() })
      .where(eq(actors.entityId, agent.entityId));
    expect(
      await rejection(f.forActor(agent.entityId).crm.getAccount(account.entityId)),
    ).toBeInstanceOf(AccessDeniedError);
  });

  test("soft-deleted entities disappear from reads and lists", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Deleted" });
    await repo.entities.softDelete(contact.entityId);
    expect(await repo.contacts.list()).toEqual([]);
    expect(await rejection(repo.contacts.get(contact.entityId))).toBeInstanceOf(AccessDeniedError);
  });
});
