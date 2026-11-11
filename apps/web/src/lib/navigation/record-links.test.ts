import { linkedWorkLink, messageLink, workLink } from "./record-links";
import { expect, test } from "bun:test";
test("linked work opens a task in its project and a project by itself", () => {
  const project = { projectEntityId: "project", entityId: "project" };
  expect(linkedWorkLink("team", { ...project, entityType: "task", entityId: "task" })).toEqual(
    workLink("team", "project", "task"),
  );
  expect(linkedWorkLink("team", { ...project, entityType: "project" })).toEqual(
    workLink("team", "project"),
  );
});
test("links preserve workspace and exact task or message targets", () => {
  expect(workLink("team", "project", "task")).toEqual({
    to: "/tasks",
    search: { workspaceId: "team", projectId: "project", taskId: "task" },
  });
  expect(messageLink("team", "conversation", "reply")).toEqual({
    to: "/dashboard",
    search: { workspaceId: "team", conversationId: "conversation", messageId: "reply" },
  });
});
