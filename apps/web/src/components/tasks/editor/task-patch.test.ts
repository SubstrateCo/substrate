import { changedTaskFields } from "./task-patch";
import { expect, test } from "bun:test";

test("task saves send only edited fields, including explicit clears", () => {
  const current = {
    title: "Task",
    description: "Notes",
    status: "not_started" as const,
    priority: "none" as const,
    assigneeActorEntityId: "actor",
    dueDate: "2026-12-01",
  };
  expect(changedTaskFields(current, { ...current, title: "Renamed" })).toEqual({
    title: "Renamed",
  });
  expect(
    changedTaskFields(current, { ...current, assigneeActorEntityId: null, dueDate: null }),
  ).toEqual({ assigneeActorEntityId: null, dueDate: null });
  expect(changedTaskFields(current, current)).toEqual({});
});
