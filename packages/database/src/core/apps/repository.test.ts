import { AccessDeniedError, AppDisabledError, ValidationError } from "../../errors";
import { organizationApps, member } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { RepositoryContext } from "../repository-context";
import { enabledApps, requireAppEnabled, requireAppsEnabled } from "./access";
import { appRepository } from "./repository";
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const f = setupDatabase();
function context(db: RepositoryContext["db"] = f.db, organizationId = f.orgA) {
  return new RepositoryContext(db, { organizationId, actorEntityId: f.alice });
}
function repository(ctx = context(), userId = "alice") {
  return appRepository(ctx, { organizationId: ctx.scope.organizationId, userId });
}

test("an organization without settings has only the required apps", async () => {
  await f.db.delete(organizationApps);
  expect(await repository().get()).toEqual({
    organizationId: f.orgA,
    enabledApps: ["messages", "agents"],
  });
  await f.db.insert(organizationApps).values({ organizationId: f.orgA, appId: "tasks" });
  expect(await enabledApps(context())).toEqual(["messages", "agents"]);
  expect(await rejection(requireAppEnabled(context(), "tasks"))).toBeInstanceOf(AppDisabledError);
  expect(await rejection(requireAppEnabled(context(), "crm"))).toBeInstanceOf(AppDisabledError);
});

test("app rows reject unknown apps and missing organizations", async () => {
  expect(
    await rejection(
      f.db.execute(
        sql`INSERT INTO organization_apps (organization_id, app_id) VALUES (${f.orgA}, 'email')`,
      ),
    ),
  ).toBeInstanceOf(Error);
  expect(
    await rejection(
      f.db.insert(organizationApps).values({
        organizationId: "missing",
        appId: "tasks",
        enabled: true,
      }),
    ),
  ).toBeInstanceOf(Error);
});

test("owners and admins update their organization, members read but cannot update", async () => {
  const apps = ["messages", "agents", "crm"] as const;
  await f.db.transaction((tx) => repository(context(tx)).update([...apps]));
  expect(await repository(context(), "bob").get()).toEqual({
    organizationId: f.orgA,
    enabledApps: [...apps],
  });
  expect(
    await rejection(
      f.db.transaction((tx) => repository(context(tx), "bob").update(["messages", "agents"])),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await enabledApps(context())).toEqual([...apps]);
  expect(await enabledApps(context(f.db, f.orgB))).toEqual(["messages", "agents", "tasks", "crm"]);
  await f.db.update(member).set({ role: "admin" }).where(eq(member.id, "bob-a"));
  await f.db.transaction((tx) => repository(context(tx), "bob").update(["messages", "agents"]));
  expect(await enabledApps(context())).toEqual(["messages", "agents"]);
  expect(await rejection(repository(context(), "outsider").get())).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("invalid settings and rolled-back updates leave apps unchanged", async () => {
  expect(
    await rejection(f.db.transaction((tx) => repository(context(tx)).update(["tasks"]))),
  ).toBeInstanceOf(ValidationError);
  expect(
    await rejection(
      f.db.transaction(async (tx) => {
        await repository(context(tx)).update(["messages", "agents"]);
        throw new Error("rollback");
      }),
    ),
  ).toMatchObject({ message: "rollback" });
  expect(await enabledApps(context())).toEqual(["messages", "agents", "tasks", "crm"]);
});

test("app checks observe later changes", async () => {
  await requireAppEnabled(context(), "tasks");
  await f.db.transaction((tx) => repository(context(tx)).update(["messages", "agents"]));
  expect(await rejection(requireAppEnabled(context(), "tasks"))).toBeInstanceOf(AppDisabledError);
});

test("batched app checks use one settings read, or no queries for no apps", async () => {
  const { db, queries } = recordQueries();
  await requireAppsEnabled(context(db), []);
  expect(queries).toEqual([]);
  await requireAppsEnabled(context(db), ["crm", "tasks"]);
  expect(queries).toHaveLength(1);
  expect(queries[0]).toContain('from "organization_apps"');
  for (const app of ["crm", "tasks"] as const) {
    await f.db
      .update(organizationApps)
      .set({ enabled: false })
      .where(eq(organizationApps.appId, app));
    expect(await rejection(requireAppsEnabled(context(db), ["crm", "tasks"]))).toBeInstanceOf(
      AppDisabledError,
    );
    await f.db
      .update(organizationApps)
      .set({ enabled: true })
      .where(eq(organizationApps.appId, app));
  }
});

test("checks observe settings changes in their transaction", async () => {
  await f.db.transaction(async (tx) => {
    await requireAppEnabled(context(tx), "tasks");
    await repository(context(tx)).update(["messages", "agents"]);
    expect(await rejection(requireAppEnabled(context(tx), "tasks"))).toBeInstanceOf(
      AppDisabledError,
    );
  });
});

test("concurrent updates leave the settings of one whole update", async () => {
  await f.db.update(member).set({ role: "admin" }).where(eq(member.id, "bob-a"));
  for (let round = 0; round < 5; round++) {
    const results = await Promise.allSettled([
      repository(context(), "alice").update(["messages", "agents", "tasks"]),
      repository(context(), "bob").update(["messages", "agents", "crm"]),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const enabled = await enabledApps(context());
    expect([
      ["messages", "agents", "tasks"],
      ["messages", "agents", "crm"],
    ]).toContainEqual(enabled);
  }
});
