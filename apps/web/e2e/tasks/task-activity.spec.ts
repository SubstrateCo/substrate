import { conversation, post, test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { project } from "../test-support/tasks";
import { expect } from "@playwright/test";

test("task activity keeps newest-first order and accessible dates", async ({ actors, client }) => {
  const actor = actors.sender;
  const [created, channel] = await Promise.all([
    project(actor),
    conversation(actor, [actors.member.email]),
  ]);
  const task = await post<{ id: string }>(actor, "tasks/mutations", {
    action: "createTask",
    organizationId: actor.organizationId,
    projectEntityId: created.entityId,
    title: "Check activity chronology",
  });
  for (const body of ["Planning notes", "Review notes", "Release notes"]) {
    const message = await post<{ id: string }>(actor, "messaging/messages", {
      conversationId: channel.id,
      body,
    });
    const linked = await actor.request.post("/api/v1/context/links", {
      data: {
        organizationId: actor.organizationId,
        entityId: task.id,
        messageId: message.id,
      },
    });
    expect(linked.ok()).toBe(true);
  }
  const user = await client(actor);
  await visit(user, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  const activity = user.page.getByRole("region", { name: "Task activity", exact: true });
  await expect(activity.getByText("Newest first", { exact: true })).toBeVisible();
  const list = activity.getByRole("list", { name: "Activity, newest first", exact: true });
  const rows = list.getByRole("listitem");
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText("linked");
  await expect(rows.last()).toContainText("created the task");
  const dates = await rows.locator("time").evaluateAll((elements) =>
    elements.map((element) => ({
      iso: element.getAttribute("datetime")!,
      label: element.textContent!,
      accessible: element.getAttribute("aria-label"),
      title: element.getAttribute("title"),
    })),
  );
  expect(dates).toHaveLength(4);
  for (const [index, date] of dates.entries()) {
    expect(date.label).toMatch(/^(?:[A-Za-z]{3} \d{1,2}(?:, \d{4})?, )?\d{1,2}:\d{2} [AP]M$/);
    expect(date.accessible).toContain(date.iso);
    expect(date.title).toBe(date.accessible);
    if (index > 0)
      expect(Date.parse(dates[index - 1]!.iso)).toBeGreaterThanOrEqual(Date.parse(date.iso));
  }
  await activity.scrollIntoViewIfNeeded();
  await captureScreenshot(user.page, "task-activity-chronology");
});
