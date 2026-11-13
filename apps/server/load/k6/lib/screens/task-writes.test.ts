import type { World } from "../world.ts";
import type { ProjectDetail, Task } from "./tasks.ts";
import { beforeEach, expect, mock, test } from "bun:test";

mock.module("../config.ts", () => ({ config: { realtime: true } }));
mock.module("../debug.ts", () => ({ trace() {} }));
mock.module("../metrics.ts", () => ({ refetches: { add() {} } }));
mock.module("./pictures.ts", () => ({ showPictures() {}, hidePictures() {} }));

const reads: { endpoint: string; input: Record<string, string> }[] = [];
const staleReads: string[] = [];
let projectId = "source";
let deleted = false;
let rejectWrite = false;
let hintDuringWrite = false;
let writes = 0;
const task: Task = {
  entityId: "task",
  projectEntityId: "source",
  parentTaskEntityId: null,
  title: "Task",
  description: "",
  status: "not_started",
  priority: "none",
  assigneeActorEntityId: null,
  dueDate: null,
};
const board = (id: string): ProjectDetail => ({
  project: { entityId: id, name: id, description: "", image: null },
  level: "owner",
  members: [],
  actors: [],
  tasks: !deleted && projectId === id ? [{ ...task, projectEntityId: id }] : [],
  links: [],
});

mock.module("../http.ts", () => ({
  async call(endpoint: string, input: Record<string, string> = {}) {
    if (endpoint === "tasks.mutations") {
      writes++;
      if (rejectWrite) return null;
      if (input.action === "deleteTask") deleted = true;
      if (input.action === "moveTask") projectId = input.destinationProjectEntityId!;
      // A committed write can publish a hint before its HTTP response arrives.
      if (hintDuringWrite) await cache.refreshAll("hint");
      return { id: "task" };
    }
    reads.push({ endpoint, input });
    if (
      (input.taskEntityId === "task" || input.entityId === "task") &&
      (deleted || (endpoint === "files.taskAttachments" && input.projectEntityId !== projectId))
    ) {
      staleReads.push(endpoint);
      return null;
    }
    if (endpoint === "tasks.project") return board(input.projectEntityId!);
    if (endpoint === "tasks.taskLocation") return { projectEntityId: projectId };
    return [];
  },
}));

const cache = await import("../client-cache.ts");
const screens = await import("./tasks.ts");
const { writeTasks } = await import("./task-writes.ts");
const { keys } = await import("../keys.ts");
const { createWorld } = await import("../world.ts");
let world: World;

beforeEach(async () => {
  cache.resetCache();
  screens.resetTaskScreen();
  projectId = "source";
  deleted = rejectWrite = hintDuringWrite = false;
  writes = 0;
  world = createWorld({
    userId: "user",
    organizationId: "org",
    email: "load@example.test",
    name: "Load user",
  });
  cache.navigate("tasks");
  await screens.openProject(world, "source");
  await screens.openTask(world, "source", "task");
  reads.length = staleReads.length = 0;
});

for (const action of ["moveTask", "deleteTask"] as const) {
  for (const hint of [false, true]) {
    test(`${action} detaches the old inspector before ${hint ? "an early hint" : "mutation refetch"}`, async () => {
      hintDuringWrite = hint;
      expect(
        await writeTasks(world, {
          projectEntityId: "source",
          taskEntityId: "task",
          ...(action === "moveTask"
            ? { action, destinationProjectEntityId: "destination", parentTaskEntityId: null }
            : { action }),
        }),
      ).toBe("task");
      await cache.refreshAll("reconcile");
      expect(staleReads).toEqual([]);
      expect(screens.openTaskId()).toBeUndefined();
      expect(cache.cached<ProjectDetail>(keys.project("org", "source"))?.tasks).toEqual([]);
      expect(reads.some((read) => read.endpoint === "tasks.project")).toBe(true);
      if (action === "moveTask") {
        await screens.openProject(world, "destination");
        expect(await screens.openTask(world, "destination", "task")).toEqual({
          available: true,
          activity: 0,
        });
        expect(
          reads.filter((read) => read.endpoint === "files.taskAttachments").at(-1)?.input,
        ).toEqual({ projectEntityId: "destination", taskEntityId: "task" });
      }
    });
  }
}

test("a rejected destructive write restores the inspector", async () => {
  rejectWrite = true;
  expect(
    await writeTasks(world, {
      action: "deleteTask",
      projectEntityId: "source",
      taskEntityId: "task",
    }),
  ).toBeNull();
  expect(screens.openTaskId()).toBe("task");
  await cache.refreshAll("reconcile");
  expect(reads.some((read) => read.endpoint === "files.taskAttachments")).toBe(true);
  expect(world.tasks.map((row) => row.entityId)).toEqual(["task"]);
});

test("field updates keep the inspector mounted and refresh its activity", async () => {
  await writeTasks(world, {
    action: "updateTask",
    projectEntityId: "source",
    taskEntityId: "task",
    title: "Renamed",
  });
  expect(screens.openTaskId()).toBe("task");
  expect(
    reads.some((read) => read.endpoint === "context.activity" && read.input.entityId === "task"),
  ).toBe(true);
});

test("a destructive write drains already running inspector reads before committing", async () => {
  const { promise, resolve } = Promise.withResolvers<unknown[]>();
  await cache.mount(keys.activity("org", "task"), () => promise);
  const pending = cache.invalidate([keys.activity("org", "task")], "hint");
  const write = writeTasks(world, {
    action: "deleteTask",
    projectEntityId: "source",
    taskEntityId: "task",
  });
  await Promise.resolve();
  expect(writes).toBe(0);
  resolve([]);
  await pending;
  expect(await write).toBe("task");
  expect(writes).toBe(1);
  expect(staleReads).toEqual([]);
});
