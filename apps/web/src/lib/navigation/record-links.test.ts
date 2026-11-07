import { workHref, messageHref } from "./record-links";
import { expect, test } from "bun:test";
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
