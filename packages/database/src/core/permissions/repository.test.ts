/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { AccessDeniedError, type PermissionLevel } from "../../index";
import { createActor } from "../actors/provisioning";
import { actors, entityGrants, member } from "../../schema";
import { setupDatabase } from "../../testing/database";

const f = setupDatabase();

describe("access controls", () => {
  test("organization admin cannot automatically read private entities", async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Private" });
    await expect(f.forActor(f.bob).contacts.get(contact.entityId)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    expect(await f.forActor(f.bob).contacts.list()).toEqual([]);
  });

  test("rejects invalid permission levels from untyped callers", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Private" });
    // SAFETY: Deliberately invalid test input; the runtime guard must reject it before use.
    const invalidLevel = "invalid" as PermissionLevel;
    // SAFETY: Deliberately empty test input; grant must reject it rather than revoke ownership.
    const emptyLevel = "" as PermissionLevel;
    await expect(repo.permissions.require(contact.entityId, invalidLevel)).rejects.toThrow(
      "Unknown permission level",
    );
    expect(() =>
      repo.permissions.grant({
        entityId: contact.entityId,
        actorEntityId: f.alice,
        level: emptyLevel,
      }),
    ).toThrow("Unknown permission level");
    expect(await repo.permissions.getEffectiveLevel(contact.entityId)).toBe("owner");
  });

  test("enforces the view, comment, edit, owner hierarchy", async () => {
    const owner = f.forActor(f.alice);
    const other = f.forActor(f.bob);
    const contact = await owner.contacts.create({ displayName: "Original" });
    for (const level of ["view", "comment", "edit"] as const) {
      await owner.permissions.grant({ entityId: contact.entityId, actorEntityId: f.bob, level });
      expect((await other.contacts.get(contact.entityId)).displayName).toBe("Original");
      await other.permissions.require(contact.entityId, level);
      await expect(
        other.permissions.grant({
          entityId: contact.entityId,
          actorEntityId: f.bob,
          level: "owner",
        }),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      if (level !== "edit") {
        await expect(
          other.contacts.update(contact.entityId, { displayName: "Changed" }),
        ).rejects.toBeInstanceOf(AccessDeniedError);
      }
      if (level === "view")
        await expect(other.permissions.require(contact.entityId, "comment")).rejects.toBeInstanceOf(
          AccessDeniedError,
        );
    }
    expect(
      (await other.contacts.update(contact.entityId, { displayName: "Changed" })).displayName,
    ).toBe("Changed");
    await owner.permissions.revoke({ entityId: contact.entityId, actorEntityId: f.bob });
    await expect(other.contacts.get(contact.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  test("cannot revoke or downgrade the last owner", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Owned" });
    await expect(
      repo.permissions.revoke({ entityId: contact.entityId, actorEntityId: f.alice }),
    ).rejects.toThrow("last owner");
    await expect(
      repo.permissions.grant({ entityId: contact.entityId, actorEntityId: f.alice, level: "view" }),
    ).rejects.toThrow("last owner");
    await repo.permissions.grant({
      entityId: contact.entityId,
      actorEntityId: f.bob,
      level: "owner",
    });
    await repo.permissions.revoke({ entityId: contact.entityId, actorEntityId: f.alice });
    expect(await f.forActor(f.bob).permissions.getEffectiveLevel(contact.entityId)).toBe("owner");
  });

  test("concurrent owners cannot revoke each other and leave an unowned entity", async () => {
    const alice = f.forActor(f.alice);
    const bob = f.forActor(f.bob);
    const contact = await alice.contacts.create({ displayName: "Owned" });
    await alice.permissions.grant({
      entityId: contact.entityId,
      actorEntityId: f.bob,
      level: "owner",
    });
    const results = await Promise.allSettled([
      alice.permissions.revoke({ entityId: contact.entityId, actorEntityId: f.bob }),
      bob.permissions.revoke({ entityId: contact.entityId, actorEntityId: f.alice }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const grants = await f.db
      .select()
      .from(entityGrants)
      .where(eq(entityGrants.entityId, contact.entityId));
    expect(grants).toHaveLength(1);
    expect(grants[0]!.level).toBe("owner");
  });

  test("rejects forged scope and cross-organization grants", async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Private" });
    const otherOrganization = f.forActor(f.outsider, f.orgB);
    await expect(otherOrganization.contacts.get(contact.entityId)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    await expect(
      otherOrganization.contacts.update(contact.entityId, { displayName: "Changed" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await otherOrganization.contacts.list()).toEqual([]);
    await expect(f.forActor(f.outsider).contacts.get(contact.entityId)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    await expect(
      f.forActor(f.alice, f.orgB).contacts.create({ displayName: "Wrong org" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      f.forActor(f.alice).permissions.grant({
        entityId: contact.entityId,
        actorEntityId: f.outsider,
        level: "view",
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  test("membership removal invalidates existing repository scopes", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Private" });
    await f.db.delete(member).where(eq(member.id, "alice-a"));
    await expect(repo.contacts.get(contact.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(repo.contacts.create({ displayName: "Blocked" })).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });

  test("agents need explicit grants and can be disabled", async () => {
    const agent = await createActor(f.db, {
      organizationId: f.orgA,
      type: "agent",
      name: "Assistant",
    });
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Customer" });
    await expect(f.forActor(agent.entityId).contacts.get(contact.entityId)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    await f.forActor(f.alice).permissions.grant({
      entityId: contact.entityId,
      actorEntityId: agent.entityId,
      level: "edit",
    });
    expect(
      (
        await f
          .forActor(agent.entityId)
          .contacts.update(contact.entityId, { displayName: "Updated" })
      ).displayName,
    ).toBe("Updated");
    await f.db
      .update(actors)
      .set({ disabledAt: new Date() })
      .where(eq(actors.entityId, agent.entityId));
    await expect(f.forActor(agent.entityId).contacts.get(contact.entityId)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });

  test("soft-deleted entities disappear from reads and lists", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Deleted" });
    await repo.entities.softDelete(contact.entityId);
    expect(await repo.contacts.list()).toEqual([]);
    await expect(repo.contacts.get(contact.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
