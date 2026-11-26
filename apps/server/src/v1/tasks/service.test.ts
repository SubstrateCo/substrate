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
  expect(publish).toHaveBeenCalledWith(hints, undefined);
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

test("sharing checks the project type without a project read, publishes hints, and hides tasks as not found", async () => {
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
  // The access check reads the type, so no separate project read runs.
  expect(queries.filter((query) => query.includes('from "projects"'))).toEqual([]);
  expect(publish).toHaveBeenCalledWith(
    expect.arrayContaining([{ audience: realtimeKeys.actor(f.orgA, f.bob), domain: "access" }]),
    // The hints were stored with the write, so the publisher can remove them once sent.
    expect.objectContaining({ id: expect.any(String) }),
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

test("project export fails inside serviceResult when export startup throws", async () => {
  const scope = scopeFixture();
  const projectEntityId = crypto.randomUUID();
  scope.repositories = {
    ...scope.repositories,
    projects: {
      ...scope.repositories.projects,
      exportStart: async () => {
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

test("project export consumes startup records and pages from the last task cursor", async () => {
  const scope = scopeFixture();
  const project = {
    entityId: crypto.randomUUID(),
    organizationId: scope.organizationId,
    entityType: "project" as const,
    name: "Launch",
    description: "Plan",
    image: null,
    archivedAt: null,
    archivedByActorEntityId: null,
  };
  const updatedAt = new Date("2026-11-22T12:34:56.123Z");
  const rows = Array.from({ length: 101 }, (_, index) => ({
    task: {
      entityId: crypto.randomUUID(),
      organizationId: scope.organizationId,
      entityType: "task" as const,
      projectEntityId: project.entityId,
      parentTaskEntityId: null,
      title: `Task ${index}`,
      description: "",
      status: "not_started" as const,
      priority: "none" as const,
      assigneeActorEntityId: null,
      dueDate: "2026-12-01",
    },
    assignee: null,
    updatedAt,
  }));
  const exportStart = mock(async () => ({ project, firstPage: rows.slice(0, 100) }));
  const exportPage = mock(async (_projectEntityId: string, _afterEntityId?: string) =>
    rows.slice(100),
  );
  scope.repositories = {
    ...scope.repositories,
    projects: { ...scope.repositories.projects, exportStart },
    tasks: { ...scope.repositories.tasks, exportPage },
  };
  const service = createTasksService({
    ensureOwnedAgentActors: async () => {},
    publish: async (committed) => committed.result,
  });
  const result = await service.export(scope, {
    organizationId: scope.organizationId,
    projectEntityId: project.entityId,
    format: "csv",
  });
  expect(exportStart).toHaveBeenCalledWith(project.entityId);
  expect(exportPage).not.toHaveBeenCalled();
  if (!result.success) throw new Error("Expected export stream");
  const records = await Array.fromAsync(result.data.records);
  expect(records).toEqual([
    { recordType: "project", entityId: project.entityId, name: "Launch", description: "Plan" },
    ...rows.map(({ task, updatedAt }) => ({
      recordType: "task",
      entityId: task.entityId,
      projectEntityId: project.entityId,
      parentTaskEntityId: null,
      title: task.title,
      description: "",
      status: "not_started",
      priority: "none",
      assigneeActorEntityId: null,
      assigneeName: null,
      dueDate: "2026-12-01",
      updatedAt,
    })),
  ]);
  expect(exportPage.mock.calls).toEqual([[project.entityId, rows[99]!.task.entityId]]);
});

test("project export starts and consumes a short page with one database query", async () => {
  await f.verifyEmails();
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Export" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "First" });
  const { db, queries } = recordQueries();
  const identity = { userId: "alice", organizationId: f.orgA };
  const scope = {
    ...scopeFixture(),
    ...identity,
    repositories: await createRepositories(db).forSession(identity),
  };
  const service = createTasksService({
    ensureOwnedAgentActors: async () => {},
    publish: async (committed) => committed.result,
  });
  queries.length = 0;
  const result = await service.export(scope, {
    organizationId: f.orgA,
    projectEntityId: project.entityId,
    format: "json",
  });
  expect(queries).toHaveLength(1);
  if (!result.success) throw new Error("Expected export stream");
  const records = await Array.fromAsync(result.data.records);
  expect(records).toMatchObject([
    { recordType: "project", entityId: project.entityId, name: "Export" },
    { recordType: "task", entityId: task.entityId, title: "First", assigneeName: null },
  ]);
  expect(queries).toHaveLength(1);
});
