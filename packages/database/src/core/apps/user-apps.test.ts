import { realtimeKeys } from "@substrate/contracts/realtime";

import { AccessDeniedError, AppDisabledError, ValidationError } from "../../errors";
import { member, userApps } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { commit } from "../effects";
import { RepositoryContext } from "../repository-context";
import { enabledApps, requireAppEnabled } from "./access";
import { appRepository } from "./repository";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
function repository(db: RepositoryContext["db"] = f.db, userId = "bob", organizationId = f.orgA) {
  return appRepository(
    new RepositoryContext(db, {
      organizationId,
      userId,
      actorEntityId: userId === "alice" ? f.alice : f.bob,
    }),
    { organizationId, userId },
  );
}
const update = (enabled: boolean, userId = "bob", organizationId = f.orgA) =>
  commit(f.db, (tx) =>
    repository(tx, userId, organizationId).updateUserApp({ appId: "inbox", enabled }),
  );

test("a member enables Inbox only for themselves and sends only a user hint", async () => {
  expect((await repository().get()).enabledApps).not.toContain("inbox");
  const saved = await update(true);
  expect(saved.result.enabledApps).toContain("inbox");
  expect(saved.hints).toEqual([{ audience: realtimeKeys.user("bob"), domain: "apps" }]);
  expect((await repository(f.db, "alice").get()).enabledApps).not.toContain("inbox");
  expect((await repository().get()).enabledApps).toContain("inbox");
  const disabled = await update(false);
  expect(disabled.result.enabledApps).not.toContain("inbox");
  expect(disabled.hints).toEqual([{ audience: realtimeKeys.user("bob"), domain: "apps" }]);
});

test("personal apps are organization-scoped and fail closed without user identity", async () => {
  await f.db.insert(member).values({ id: "bob-b", organizationId: f.orgB, userId: "bob" });
  await update(true);
  expect((await repository(f.db, "bob", f.orgB).get()).enabledApps).not.toContain("inbox");
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  expect(await enabledApps(context)).not.toContain("inbox");
  expect(await rejection(requireAppEnabled(context, "inbox"))).toBeInstanceOf(AppDisabledError);
  const owned = new RepositoryContext(f.db, { ...context.scope, userId: "bob" });
  await requireAppEnabled(owned, "inbox");
  await update(false);
  expect(await rejection(requireAppEnabled(owned, "inbox"))).toBeInstanceOf(AppDisabledError);
});

test("workspace updates do not change personal apps", async () => {
  await update(true, "alice");
  const saved = await commit(f.db, (tx) => repository(tx, "alice").update(["messages", "agents"]));
  expect(saved.result.enabledApps).toEqual(["messages", "agents", "inbox"]);
  expect((await repository().get()).enabledApps).toEqual(["messages", "agents"]);
  expect(
    await rejection(
      commit(f.db, (tx) => repository(tx, "alice").update(["messages", "agents", "inbox"])),
    ),
  ).toBeInstanceOf(ValidationError);
});

test("personal activation does not bypass centralized record grants or workspace app gates", async () => {
  await f.verifyEmails();
  const owner = await f.forSession("alice");
  const member = await f.forSession("bob");
  const { result: shared } = await owner.projects.create({ name: "Shared project" });
  const { result: task } = await owner.tasks.create({
    projectEntityId: shared.entityId,
    title: "Shared task",
  });
  const { result: privateProject } = await owner.projects.create({ name: "Private project" });
  await owner.projects.share(shared.entityId, f.bob, "view");

  const activated = await member.organizations.updateUserApp({ appId: "inbox", enabled: true });
  expect(activated.hints).toEqual([{ audience: realtimeKeys.user("bob"), domain: "apps" }]);
  expect((await member.tasks.get(task.entityId)).title).toBe("Shared task");
  expect(await rejection(member.projects.get(privateProject.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );

  await owner.organizations.updateApps(["messages", "agents", "crm"]);
  expect((await member.organizations.apps()).enabledApps).toContain("inbox");
  for (const viewer of [owner, member])
    expect(await rejection(viewer.tasks.get(task.entityId))).toBeInstanceOf(AppDisabledError);
  expect(await member.projects.list()).toEqual([]);

  await member.organizations.updateUserApp({ appId: "inbox", enabled: false });
  await owner.organizations.updateApps(["messages", "agents", "tasks", "crm"]);
  expect((await member.tasks.get(task.entityId)).title).toBe("Shared task");
  expect(await rejection(member.projects.get(privateProject.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("personal app writes reject nonmembers and nonpersonal apps", async () => {
  expect(await rejection(update(true, "outsider"))).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(
      commit(f.db, (tx) =>
        // SAFETY: Invalid app deliberately bypasses the input type to exercise runtime validation.
        repository(tx).updateUserApp({ appId: "tasks", enabled: true } as never),
      ),
    ),
  ).toBeInstanceOf(ValidationError);
  expect(await f.db.select().from(userApps)).toEqual([]);
});

test("personal apps roll back and are removed with membership", async () => {
  expect(
    await rejection(
      commit(f.db, async (tx) => {
        await repository(tx).updateUserApp({ appId: "inbox", enabled: true });
        throw new Error("rollback");
      }),
    ),
  ).toMatchObject({ message: "rollback" });
  expect((await repository().get()).enabledApps).not.toContain("inbox");
  await update(true);
  await f.db.delete(member).where(eq(member.id, "bob-a"));
  expect(await f.db.select().from(userApps)).toEqual([]);
  expect(await rejection(update(true))).toBeInstanceOf(AccessDeniedError);
});

test("personal app rows require membership in the same organization", async () => {
  expect(
    await rejection(
      f.db.insert(userApps).values({
        organizationId: f.orgA,
        userId: "outsider",
        appId: "inbox",
        enabled: true,
      }),
    ),
  ).toBeInstanceOf(Error);
});
