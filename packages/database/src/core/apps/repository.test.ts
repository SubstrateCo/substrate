import { AccessDeniedError, AppDisabledError, ValidationError } from "../../errors";
import { organizationApps, member } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { waitForLockWaiters } from "../../testing/locks";
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

test("read app checks take no row locks and observe later changes", async () => {
  const { db, queries } = recordQueries();
  await requireAppEnabled(context(db), "tasks", false);
  await f.db.transaction((tx) => repository(context(tx)).update(["messages", "agents"]));
  expect(await rejection(requireAppEnabled(context(db), "tasks", false))).toBeInstanceOf(
    AppDisabledError,
  );
  expect(queries.some((query) => /for (share|update|no key update)/i.test(query))).toBe(false);
});

test("batched app checks use one lock and one settings read, or no queries for no apps", async () => {
  const { db, queries } = recordQueries();
  await requireAppsEnabled(context(db), []);
  expect(queries).toEqual([]);
  await db.transaction(async (tx) => {
    queries.length = 0;
    await requireAppsEnabled(context(tx), ["crm", "tasks"]);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('from "organization"');
    expect(queries[0]).toContain("for share");
    expect(queries[1]).toContain('from "organization_apps"');
  });
  queries.length = 0;
  await requireAppsEnabled(context(db), ["crm", "tasks"], false);
  expect(queries).toHaveLength(1);
  expect(queries[0]).not.toContain("for share");
  for (const app of ["crm", "tasks"] as const) {
    await f.db
      .update(organizationApps)
      .set({ enabled: false })
      .where(eq(organizationApps.appId, app));
    expect(
      await rejection(db.transaction((tx) => requireAppsEnabled(context(tx), ["crm", "tasks"]))),
    ).toBeInstanceOf(AppDisabledError);
    await f.db
      .update(organizationApps)
      .set({ enabled: true })
      .where(eq(organizationApps.appId, app));
  }
});

test("batched mutation guards read fresh settings after waiting for the organization lock", async () => {
  let release!: () => void;
  let locked!: () => void;
  const held = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const finish = new Promise<void>((resolve) => {
    release = resolve;
  });
  const disable = f.db.transaction(async (tx) => {
    await repository(context(tx)).update(["messages", "agents", "tasks"]);
    locked();
    await finish;
  });
  await held;
  const check = rejection(
    f.db.transaction((tx) => requireAppsEnabled(context(tx), ["tasks", "crm"])),
  );
  try {
    await waitForLockWaiters();
  } finally {
    release();
    await disable;
  }
  expect(await check).toBeInstanceOf(AppDisabledError);
});

test("locked checks observe settings changes in their transaction", async () => {
  const { db } = recordQueries();
  await db.transaction(async (tx) => {
    await requireAppEnabled(context(tx), "tasks");
    await requireAppEnabled(context(tx), "crm");
    await requireAppEnabled(context(tx), "tasks");
    await repository(context(tx)).update(["messages", "agents"]);
    expect(await rejection(requireAppEnabled(context(tx), "tasks"))).toBeInstanceOf(
      AppDisabledError,
    );
  });
  expect(
    await rejection(db.transaction((tx) => requireAppEnabled(context(tx), "tasks"))),
  ).toBeInstanceOf(AppDisabledError);
});

test("an outer guard cannot retain an app enabled by a rolled-back savepoint", async () => {
  await f.db.transaction(async (tx) => {
    await repository(context(tx)).update(["messages", "agents", "crm"]);
    const outer = context(tx);
    await requireAppEnabled(outer, "crm");
    expect(
      await rejection(
        tx.transaction(async (nested) => {
          await repository(context(nested)).update(["messages", "agents", "tasks", "crm"]);
          await requireAppEnabled(outer, "tasks");
          throw new Error("rollback enabled app");
        }),
      ),
    ).toMatchObject({ message: "rollback enabled app" });
    expect(await rejection(requireAppEnabled(outer, "tasks"))).toBeInstanceOf(AppDisabledError);
  });
});

test("locked checks refresh after settings changes in a nested savepoint", async () => {
  await f.db.transaction(async (tx) => {
    await requireAppEnabled(context(tx), "tasks");
    await tx.transaction((nested) => repository(context(nested)).update(["messages", "agents"]));
    expect(await rejection(requireAppEnabled(context(tx), "tasks"))).toBeInstanceOf(
      AppDisabledError,
    );
    expect(
      await rejection(
        tx.transaction(async (nested) => {
          await repository(context(nested)).update(["messages", "agents", "tasks"]);
          throw new Error("rollback settings");
        }),
      ),
    ).toMatchObject({ message: "rollback settings" });
    expect(await rejection(requireAppEnabled(context(tx), "tasks"))).toBeInstanceOf(
      AppDisabledError,
    );
  });
});

test("disable waits for a guarded domain transaction and later writes fail closed", async () => {
  let release!: () => void;
  let locked!: () => void;
  const held = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const finish = new Promise<void>((resolve) => {
    release = resolve;
  });
  const domainWrite = f.db.transaction(async (tx) => {
    await requireAppEnabled(context(tx), "tasks");
    locked();
    await finish;
  });
  await held;
  const disable = f.db.transaction((tx) => repository(context(tx)).update(["messages", "agents"]));
  try {
    await waitForLockWaiters();
    expect(await enabledApps(context())).toContain("tasks");
  } finally {
    release();
    await domainWrite;
    await disable;
  }
  expect(
    await rejection(f.db.transaction((tx) => requireAppEnabled(context(tx), "tasks"))),
  ).toBeInstanceOf(AppDisabledError);
});
