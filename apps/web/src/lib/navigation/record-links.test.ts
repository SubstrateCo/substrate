import { linkedWorkHref, workHref, messageHref } from "./record-links";
import { expect, test } from "bun:test";
test("linked work opens a task in its project and a project by itself", () => {
  const project = { projectEntityId: "project", entityId: "project" };
  expect(linkedWorkHref("team", { ...project, entityType: "task", entityId: "task" })).toBe(
    workHref("team", "project", "task"),
  );
  expect(linkedWorkHref("team", { ...project, entityType: "project" })).toBe(
    workHref("team", "project"),
  );
});
test("links preserve workspace and exact task or message targets", () => {
  const work = new URL(workHref("team & one", "project", "task"), "https://example.test");
  expect(Object.fromEntries(work.searchParams)).toEqual({
    workspaceId: "team & one",
    projectId: "project",
    taskId: "task",
  });
  expect(
    Object.fromEntries(
      new URL(messageHref("team", "conversation", "reply"), "https://example.test").searchParams,
    ),
  ).toEqual({ workspaceId: "team", conversationId: "conversation", messageId: "reply" });
});
