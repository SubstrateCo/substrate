import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";
import { AppDisabledError } from "@substrate/database";

import { entityGrants } from "../../../../../packages/database/src/core/permissions/schema";
import { createRepositories } from "../../../../../packages/database/src/repositories";
import { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { recordQueries } from "../../../../../packages/database/src/testing/queries";
import { createCommittedPublisher } from "../../shared/committed";
import { scopeFixture } from "../../test-support";
import { createTasksService } from "./service";
import { expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("discussion resolution publishes its hints and returns the conversation ID", async () => {
  const scope = scopeFixture();
  const projectEntityId = crypto.randomUUID();
  const taskEntityId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const hints: RealtimeHint[] = [
    { audience: realtimeKeys.conversation(conversationId), domain: "messaging" },
  ];
  const ensureDiscussion = mock(async () => ({ result: conversationId, hints }));
  const publish = mock(async (_hints: RealtimeHint[]) => {});
  scope.repositories = {
    ...scope.repositories,
    tasks: { ...scope.repositories.tasks, ensureDiscussion },
  };
  const service = createTasksService({
    ensureOwnedAgentActors: async () => {},
    publish: createCommittedPublisher({ publish, sharingMail: { trigger: () => {} } }),
  });
  expect(
    await service.ensureDiscussion(scope, {
      organizationId: scope.organizationId,
      projectEntityId,
      taskEntityId,
    }),
  ).toEqual({ success: true, data: { conversationId } });
  expect(ensureDiscussion).toHaveBeenCalledWith(taskEntityId, projectEntityId);
  expect(publish).toHaveBeenCalledWith(hints);
});

test("project detail provisions the session owner's agents and returns only the scoped detail", async () => {
  const scope = scopeFixture();
  const projectEntityId = crypto.randomUUID();
  const ensureOwnedAgentActors = mock(async () => {});
  const getDetail = mock(async () => {
    throw new Error("private persistence failure");
  });
  scope.repositories = {
    ...scope.repositories,
    projects: { ...scope.repositories.projects, getDetail },
  };
  const service = createTasksService({
    ensureOwnedAgentActors,
    publish: async (committed) => committed.result,
  });
  expect(
    await service.getProject(scope, { organizationId: scope.organizationId, projectEntityId }),
  ).toEqual({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "The operation is unavailable. Please try again." },
  });
  expect(ensureOwnedAgentActors).toHaveBeenCalledWith({
    userId: scope.userId,
    organizationId: scope.organizationId,
  });
  expect(getDetail).toHaveBeenCalledWith(projectEntityId);
});

test("sharing checks the project under one lock, publishes hints, and hides tasks as not found", async () => {
  await f.verifyEmails();
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Shared" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Child" });
  const { db, queries } = recordQueries();
  const identity = { userId: "alice", organizationId: f.orgA };
  const scope = {
    ...scopeFixture(),
    ...identity,
    repositories: await createRepositories(db).forSession(identity),
  };
  const publish = mock(async (_hints: RealtimeHint[]) => {});
  const service = createTasksService({
    ensureOwnedAgentActors: async () => {},
    publish: createCommittedPublisher({ publish, sharingMail: { trigger: () => {} } }),
  });
  const share = (projectEntityId: string) =>
    service.mutateTasks(scope, {
      organizationId: f.orgA,
      action: "share",
      projectEntityId,
      actorEntityId: f.bob,
      level: "edit",
    });
  queries.length = 0;
  expect(await share(project.entityId)).toEqual({ success: true, data: { id: project.entityId } });
  expect(queries.filter((query) => query.includes("FOR NO KEY UPDATE"))).toHaveLength(1);
  // The structural lock checks the type, so no separate project read runs.
  expect(queries.filter((query) => query.includes('from "projects"'))).toEqual([]);
  expect(publish).toHaveBeenCalledWith(
    expect.arrayContaining([{ audience: realtimeKeys.actor(f.orgA, f.bob), domain: "access" }]),
  );
  expect(await f.accessLevel(f.bob, project.entityId)).toBe("edit");
  expect(await share(task.entityId)).toMatchObject({
    success: false,
    error: { code: "NOT_FOUND" },
  });
  expect(
    await f.db.select().from(entityGrants).where(eq(entityGrants.entityId, task.entityId)),
  ).toEqual([]);
});

test("project export fails inside serviceResult when the first task page throws", async () => {
  const scope = scopeFixture();
  const projectEntityId = crypto.randomUUID();
  scope.repositories = {
    ...scope.repositories,
    projects: {
      ...scope.repositories.projects,
      get: async () => ({
        entityId: projectEntityId,
        organizationId: scope.organizationId,
        entityType: "project" as const,
        name: "Launch",
        description: "",
        image: null,
      }),
    },
    tasks: {
      ...scope.repositories.tasks,
      exportPage: async () => {
        throw new AppDisabledError();
      },
    },
  };
  const service = createTasksService({
    ensureOwnedAgentActors: async () => {},
    publish: async (committed) => committed.result,
  });
  expect(
    await service.export(scope, {
      organizationId: scope.organizationId,
      projectEntityId,
      format: "csv",
    }),
  ).toMatchObject({ success: false, error: { code: "APP_DISABLED" } });
});
